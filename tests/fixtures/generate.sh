#!/usr/bin/env bash
# Generates real, valid sample files used by the integration test suite.
# These are not fakes: ffmpeg generates real decodable audio/video, pandoc/LibreOffice
# generate real parseable documents.
set -euo pipefail
cd "$(dirname "$0")"

echo "Generating audio/video fixtures with ffmpeg..."
ffmpeg -y -loglevel error -f lavfi -i "sine=frequency=440:duration=1" -ar 44100 sample.wav
ffmpeg -y -loglevel error -i sample.wav -codec:a libmp3lame -qscale:a 2 sample.mp3
ffmpeg -y -loglevel error -i sample.wav -codec:a aac -b:a 128k sample.m4a
ffmpeg -y -loglevel error -i sample.wav -codec:a flac sample.flac
ffmpeg -y -loglevel error -f lavfi -i "testsrc=duration=1:size=320x240:rate=15" -f lavfi -i "sine=frequency=440:duration=1" \
  -c:v libx264 -preset veryfast -c:a aac -shortest sample.mp4
ffmpeg -y -loglevel error -i sample.mp4 -c:v libx264 -preset veryfast -c:a aac sample.mov
ffmpeg -y -loglevel error -i sample.mp4 -c:v libvpx-vp9 -crf 32 -b:v 0 -c:a libopus sample.webm
ffmpeg -y -loglevel error -i sample.mp4 -c:v libx264 -preset veryfast -c:a aac sample.mkv
# A corrupted/truncated "video" for negative-path testing.
head -c 2048 sample.mp4 > corrupted.mp4

echo "Generating image fixtures..."
ffmpeg -y -loglevel error -f lavfi -i "testsrc=size=200x150:rate=1" -frames:v 1 sample.png
ffmpeg -y -loglevel error -i sample.png sample.jpg
ffmpeg -y -loglevel error -i sample.png sample.bmp
ffmpeg -y -loglevel error -i sample.png sample.gif
ffmpeg -y -loglevel error -i sample.png -c:v libwebp sample.webp

echo "Generating text/data fixtures..."
cat > sample.txt <<'EOF'
Auto Download Converter - sample text fixture.
This file is used by the automated test suite to verify TXT-based conversions.
It has multiple lines, some punctuation (commas, periods, quotes "like this"),
and a line that is long enough to require word-wrapping when rendered onto a
PDF page so the text layout logic actually gets exercised instead of trivially
passing on a single short line.
EOF

cat > sample.md <<'EOF'
# Sample Document

This is a **bold** statement and this is *italic*.

## Section

- item one
- item two
- item three

Here is a [link](https://example.com) and some `inline code`.

```
a code block
with two lines
```
EOF

cat > sample.csv <<'EOF'
name,age,city
Alice,30,New York
Bob,25,"San Francisco, CA"
Charlie,35,London
EOF

cat > sample.json <<'EOF'
{
  "title": "Sample",
  "count": 3,
  "items": [
    {"name": "Alice", "age": 30},
    {"name": "Bob", "age": 25},
    {"name": "Charlie", "age": 35}
  ],
  "active": true,
  "notes": null
}
EOF

cat > sample.xml <<'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<catalog>
  <book id="1">
    <title>Sample Book</title>
    <author>Jane Doe</author>
  </book>
  <book id="2">
    <title>Another Book</title>
    <author>John Smith</author>
  </book>
</catalog>
EOF

cat > sample.html <<'EOF'
<!DOCTYPE html>
<html>
<head><title>Sample</title></head>
<body>
<h1>Sample HTML</h1>
<p>This is a paragraph with <b>bold</b> and <i>italic</i> text.</p>
<ul><li>one</li><li>two</li></ul>
</body>
</html>
EOF

cat > sample.rtf <<'EOF'
{\rtf1\ansi\deff0
{\fonttbl{\f0 Times New Roman;}}
\f0\fs24 This is a sample RTF document used for testing.\par
It has \b bold\b0  and \i italic\i0  text.\par
}
EOF

echo "Generating document fixtures with pandoc..."
pandoc sample.md -o sample.docx
pandoc sample.md -o sample.odt

echo "Done. Fixture files:"
ls -la
