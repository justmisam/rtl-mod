#!/usr/bin/env python3
"""Make an Arabic-script-only copy of a TrueType font under another family name.

Only two tables change: `cmap` (every code point outside the Arabic blocks is
unmapped, so the font answers for Arabic-script text alone) and `name` (the
family is the alias; the full and PostScript names are not, so a page's
`local("<alias>")` does not match it). Glyphs, shaping and metrics stay as made.
No dependencies.
"""
import struct, sys

KEEP = [(0x0600, 0x06FF), (0x0750, 0x077F), (0x0870, 0x08FF), (0xFB50, 0xFDFF),
        (0xFE70, 0xFEFF), (0x200C, 0x200D)]

def checksum(data):
    data += b'\0' * (-len(data) % 4)
    return sum(struct.unpack('>%dI' % (len(data) // 4), data)) & 0xFFFFFFFF

def read_tables(raw):
    version, count = struct.unpack('>IH', raw[:6])
    if version not in (0x00010000, 0x74727565):
        raise SystemExit('not a TrueType-outline font (sfnt version %08X)' % version)
    tables = {}
    for k in range(count):
        tag, _, off, length = struct.unpack('>4sIII', raw[12 + 16 * k: 28 + 16 * k])
        tables[tag.decode('latin1')] = raw[off: off + length]
    return version, tables

def read_cmap(cmap):
    """code point -> glyph id, from the best Unicode subtable (format 12, else 4)."""
    count = struct.unpack('>H', cmap[2:4])[0]
    best = None
    for k in range(count):
        plat, enc, off = struct.unpack('>HHI', cmap[4 + 8 * k: 12 + 8 * k])
        fmt = struct.unpack('>H', cmap[off: off + 2])[0]
        rank = {(3, 10, 12): 4, (0, 4, 12): 4, (0, 6, 12): 4, (3, 1, 4): 3, (0, 3, 4): 2}.get((plat, enc, fmt), 1 if fmt in (4, 12) and plat in (0, 3) else 0)
        if rank and (best is None or rank > best[0]):
            best = (rank, fmt, off)
    if best is None:
        raise SystemExit('no Unicode cmap subtable in format 4 or 12')
    _, fmt, off = best
    mapping = {}
    if fmt == 12:
        groups = struct.unpack('>I', cmap[off + 12: off + 16])[0]
        for g in range(groups):
            start, end, gid = struct.unpack('>III', cmap[off + 16 + 12 * g: off + 28 + 12 * g])
            for cp in range(start, end + 1):
                mapping[cp] = gid + cp - start
    else:
        segx2 = struct.unpack('>H', cmap[off + 6: off + 8])[0]
        seg = segx2 // 2
        ends = struct.unpack('>%dH' % seg, cmap[off + 14: off + 14 + segx2])
        base = off + 16 + segx2
        starts = struct.unpack('>%dH' % seg, cmap[base: base + segx2])
        deltas = struct.unpack('>%dh' % seg, cmap[base + segx2: base + 2 * segx2])
        ro_at = base + 2 * segx2
        ranges = struct.unpack('>%dH' % seg, cmap[ro_at: ro_at + segx2])
        for s in range(seg):
            for cp in range(starts[s], ends[s] + 1):
                if cp == 0xFFFF:
                    continue
                if ranges[s] == 0:
                    gid = (cp + deltas[s]) & 0xFFFF
                else:
                    at = ro_at + 2 * s + ranges[s] + 2 * (cp - starts[s])
                    gid = struct.unpack('>H', cmap[at: at + 2])[0]
                    if gid:
                        gid = (gid + deltas[s]) & 0xFFFF
                if gid:
                    mapping[cp] = gid
    return mapping

def build_cmap(mapping):
    """One format 4 subtable, listed for Unicode and for Windows BMP."""
    cps = sorted(cp for cp in mapping if cp < 0xFFFF)
    segs = []                                   # (start, end, delta), glyph ids consecutive
    for cp in cps:
        gid = mapping[cp]
        if segs and segs[-1][1] == cp - 1 and ((cp + segs[-1][2]) & 0xFFFF) == gid:
            segs[-1] = (segs[-1][0], cp, segs[-1][2])
        else:
            segs.append((cp, cp, (gid - cp) & 0xFFFF))
    segs.append((0xFFFF, 0xFFFF, 1))
    n = len(segs)
    search = 2 * (1 << (n.bit_length() - 1))
    sub = struct.pack('>HHHHHHH', 4, 16 + 8 * n, 0, 2 * n, search, n.bit_length() - 1, 2 * n - search)
    sub += struct.pack('>%dH' % n, *[s[1] for s in segs]) + b'\0\0'
    sub += struct.pack('>%dH' % n, *[s[0] for s in segs])
    sub += struct.pack('>%dH' % n, *[s[2] for s in segs])
    sub += struct.pack('>%dH' % n, *([0] * n))
    head = struct.pack('>HH', 0, 2) + struct.pack('>HHI', 0, 3, 20) + struct.pack('>HHI', 3, 1, 20)
    return head + sub

def read_names(name):
    """Windows English strings by name id."""
    count, strings = struct.unpack('>HH', name[2:6])
    out = {}
    for k in range(count):
        plat, enc, lang, nid, length, off = struct.unpack('>6H', name[6 + 12 * k: 18 + 12 * k])
        if plat == 3 and enc in (1, 10) and lang == 0x409:
            out[nid] = name[strings + off: strings + off + length].decode('utf-16-be', 'replace')
    return out

def build_name(strings):
    records, blob = [], b''
    for plat, enc, lang, codec in ((1, 0, 0, 'mac_roman'), (3, 1, 0x409, 'utf-16-be')):
        for nid in sorted(strings):
            data = strings[nid].encode(codec, 'replace')
            records.append((plat, enc, lang, nid, len(data), len(blob)))
            blob += data
    out = struct.pack('>HHH', 0, len(records), 6 + 12 * len(records))
    for rec in records:
        out += struct.pack('>6H', *rec)
    return out + blob

def write_font(version, tables, path):
    tags = sorted(tables)
    n = len(tags)
    search = 16 * (1 << (n.bit_length() - 1))
    head = bytearray(tables['head'])
    head[8:12] = b'\0\0\0\0'                       # checkSumAdjustment, set below
    tables['head'] = bytes(head)
    offset = 12 + 16 * n
    directory, body = b'', b''
    for tag in tags:
        data = tables[tag]
        directory += struct.pack('>4sIII', tag.encode('latin1'), checksum(data), offset + len(body), len(data))
        body += data + b'\0' * (-len(data) % 4)
    font = struct.pack('>IHHHH', version, n, search, n.bit_length() - 1, 16 * n - search) + directory + body
    adjust = (0xB1B0AFBA - checksum(font)) & 0xFFFFFFFF
    head_off = struct.unpack('>I', directory[16 * tags.index('head') + 8: 16 * tags.index('head') + 12])[0]
    font = font[:head_off + 8] + struct.pack('>I', adjust) + font[head_off + 12:]
    open(path, 'wb').write(font)

def main(src, dst, family, style, full, postscript):
    version, tables = read_tables(open(src, 'rb').read())
    if 'fvar' in tables:
        raise SystemExit('a variable font: give a static one')
    mapping = {cp: gid for cp, gid in read_cmap(tables['cmap']).items()
               if any(a <= cp <= b for a, b in KEEP)}
    if not mapping:
        raise SystemExit('the font has no Arabic-script characters')
    old = read_names(tables['name'])
    names = {nid: old[nid] for nid in (0, 5, 7, 8, 9, 11, 12, 13, 14) if nid in old}   # credits and licence stay
    names.update({1: family, 2: style, 3: postscript + ';arabic-alias', 4: full, 6: postscript})
    tables['cmap'] = build_cmap(mapping)
    tables['name'] = build_name(names)
    tables.pop('DSIG', None)                       # a signature of the original no longer holds
    write_font(version, tables, dst)
    print('%s: %d Arabic-script code points kept, family "%s", style "%s", full name "%s"' % (dst, len(mapping), family, style, full))

if __name__ == '__main__':
    main(*sys.argv[1:7])
