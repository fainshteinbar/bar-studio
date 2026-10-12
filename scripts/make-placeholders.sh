#!/usr/bin/env bash
# Generates phase-2 placeholder media: 9 vertical "reels", a 16:9 hero loop built
# 3-up from them (the PLAN.md 4.7 recipe), a portrait hero loop, WebP posters + LQIP,
# Bar's portrait as WebP, and copies the web fonts the directions use.
# Idempotent: re-running overwrites outputs. Needs ffmpeg + cwebp.
set -euo pipefail
cd "$(dirname "$0")/.."

OUT=assets/placeholders
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
mkdir -p "$OUT" assets/img assets/fonts

W=480; H=854; D=5; R=30
ENC=(-c:v libx264 -preset slow -crf 32 -pix_fmt yuv420p -movflags +faststart -an -r $R)

# Brand palette: void 07071C, navy 1A1464, cyan 00C2FF, cream F4F0E8
SRC=(
  "gradients=s=${W}x${H}:r=$R:d=$D:c0=07071C:c1=1A1464:c2=00C2FF:c3=F4F0E8:n=4:speed=0.025:type=radial:seed=11"
  "mandelbrot=s=${W}x${H}:r=$R:start_scale=1.5:end_scale=0.02:end_pts=150,hue=s=0,gblur=sigma=1.6,colorchannelmixer=rr=0.12:gg=0.72:bb=1"
  "life=s=90x160:r=$R:mold=12:ratio=0.12:life_color=#00C2FF:death_color=#1A1464:mold_color=#07071C,scale=${W}:${H}:flags=neighbor"
  "gradients=s=${W}x${H}:r=$R:d=$D:c0=1A1464:c1=00C2FF:c2=07071C:n=3:speed=0.03:type=spiral:seed=5"
  "cellauto=s=${W}x${H}:r=$R:rule=110:random_fill_ratio=0.5:scroll=1,lutrgb=r='val*0.10':g='val*0.76':b='val',gblur=sigma=1.2"
  "gradients=s=${W}x${H}:r=$R:d=$D:c0=00C2FF:c1=07071C:c2=1A1464:c3=00C2FF:c4=07071C:n=5:speed=0.06:type=linear:seed=3"
  "gradients=s=${W}x${H}:r=$R:d=$D:c0=F4F0E8:c1=00C2FF:c2=1A1464:c3=07071C:n=4:speed=0.02:type=circular:seed=21"
  "mandelbrot=s=${W}x${H}:r=$R:start_x=-0.743643887:start_y=0.131825904:start_scale=0.4:end_scale=0.0005:end_pts=150,hue=s=0,gblur=sigma=1.6,colorchannelmixer=rr=0.12:gg=0.72:bb=1,negate,colorchannelmixer=rr=0.15:gg=0.25:bb=0.55"
  "nullsrc=s=${W}x${H}:r=$R:d=$D,format=gbrp,geq=r='7+12*lt(mod(Y+T*120\,60)\,4)':g='7+180*lt(mod(Y+T*120\,60)\,4)+30*lt(mod(X+400-T*40\,90)\,2)':b='28+220*lt(mod(Y+T*120\,60)\,4)+60*lt(mod(X+400-T*40\,90)\,2)'"
)

lqip() { # $1 png -> base64 data URI of a 24px-wide webp
  cwebp -quiet -resize 24 0 -q 40 "$1" -o "$TMP/lq.webp"
  printf 'data:image/webp;base64,%s' "$(base64 < "$TMP/lq.webp" | tr -d '\n')"
}

: > "$TMP/lqip.tsv"
for i in "${!SRC[@]}"; do
  n=$(printf '%02d' $((i + 1)))
  ffmpeg -loglevel error -y -f lavfi -i "${SRC[$i]}" -t $D -vf "scale=${W}:${H},format=yuv420p" "${ENC[@]}" "$OUT/reel-$n.mp4"
  ffmpeg -loglevel error -y -ss 1.2 -i "$OUT/reel-$n.mp4" -frames:v 1 "$TMP/p$n.png"
  cwebp -quiet -q 72 "$TMP/p$n.png" -o "$OUT/reel-$n.webp"
  printf '%s\t%s\n' "$n" "$(lqip "$TMP/p$n.png")" >> "$TMP/lqip.tsv"
done

# Hero 16:9: three reels side by side per segment, 3 segments, 0.4 s crossfades.
seg() { # $1 $2 $3 reel numbers -> $TMP/seg-$4.mp4
  ffmpeg -loglevel error -y -i "$OUT/reel-$1.mp4" -i "$OUT/reel-$2.mp4" -i "$OUT/reel-$3.mp4" -filter_complex \
    "[0]scale=428:-2,crop=428:720[a];[1]scale=428:-2,crop=428:720[b];[2]scale=428:-2,crop=428:720[c];[a][b][c]hstack=3,crop=1280:720,format=yuv420p" \
    -t 3.4 -c:v libx264 -preset slow -crf 20 -an -r $R "$TMP/seg-$4.mp4"
}
seg 01 02 03 a; seg 04 05 06 b; seg 07 08 09 c
ffmpeg -loglevel error -y -i "$TMP/seg-a.mp4" -i "$TMP/seg-b.mp4" -i "$TMP/seg-c.mp4" -filter_complex \
  "[0][1]xfade=transition=fade:duration=0.4:offset=3[ab];[ab][2]xfade=transition=fade:duration=0.4:offset=6" \
  -c:v libx264 -preset slow -crf 30 -pix_fmt yuv420p -movflags +faststart -an "$OUT/hero-loop.mp4"
ffmpeg -loglevel error -y -ss 0.5 -i "$OUT/hero-loop.mp4" -frames:v 1 "$TMP/hero.png"
cwebp -quiet -q 70 "$TMP/hero.png" -o "$OUT/hero-loop.webp"

# Hero portrait (mobile): one reel at a time, 2.5 s each.
ffmpeg -loglevel error -y -i "$OUT/reel-01.mp4" -i "$OUT/reel-04.mp4" -i "$OUT/reel-07.mp4" -filter_complex \
  "[0]trim=0:2.5,setpts=PTS-STARTPTS[a];[1]trim=0:2.5,setpts=PTS-STARTPTS[b];[2]trim=0:2.5,setpts=PTS-STARTPTS[c];[a][b]xfade=transition=fade:duration=0.4:offset=2.1[ab];[ab][c]xfade=transition=fade:duration=0.4:offset=4.2,format=yuv420p" \
  "${ENC[@]}" "$OUT/hero-loop-portrait.mp4"
ffmpeg -loglevel error -y -ss 0.5 -i "$OUT/hero-loop-portrait.mp4" -frames:v 1 "$TMP/heroP.png"
cwebp -quiet -q 70 "$TMP/heroP.png" -o "$OUT/hero-loop-portrait.webp"

cp "$TMP/lqip.tsv" "$OUT/lqip.tsv"

# Bar's own portrait (transparent PNG) -> WebP, two widths.
cwebp -quiet -q 80 -alpha_q 90 -resize 560 0 Bar_Hero_Clean.png -o assets/img/bar-560.webp
cwebp -quiet -q 80 -alpha_q 90 Bar_Hero_Clean.png -o assets/img/bar-1070.webp

# Fonts: hebrew + latin subsets only, for the weights the directions use.
F=node_modules/@fontsource
cpf() { for w in "${@:2}"; do for s in hebrew latin; do cp "$F/$1/files/$1-$s-$w-normal.woff2" "assets/fonts/$1-$s-$w.woff2"; done; done; }
cpf karantina 700
cpf heebo 400 700 900
cpf frank-ruhl-libre 400 800
cpf assistant 400 600 800
cpf rubik 400 500 800
cpf secular-one 400
cpf ibm-plex-sans-hebrew 400 600
cpf noto-serif-hebrew 300 600
cp fonts/BebasNeue-latin.woff2 assets/fonts/bebas-neue-latin-400.woff2

ls -la "$OUT" | awk '{print $5, $9}'
du -sh "$OUT" assets/img assets/fonts
