---
name: "arabic-rtl-ui"
description: "Use whenever building or fixing any Arabic or RTL interface — web, PWA, React, Flutter, or Unity UI — including layout, alignment, fonts, numbers, and mixed Arabic/English text (واجهة عربية، اتجاه، يمين لليسار)."
---

# Arabic / RTL UI Rules

Apply these by default whenever the UI is Arabic, without waiting to be asked.

## Web / React / PWA
- Root: `<html lang="ar" dir="rtl">`. Never fake RTL with `text-align: right` alone.
- Use logical CSS properties: `margin-inline-start/end`, `padding-inline-*`, `inset-inline-*`, `border-inline-*`, `text-align: start/end`. Avoid left/right in new code.
- Tailwind: use `ms-* me-* ps-* pe-* start-* end-*` and `rtl:`/`ltr:` variants; not `ml-*`/`mr-*`.
- Flex/grid follow `dir` automatically — do not add `flex-row-reverse` to "fix" RTL (it double-flips).
- Mirror directional icons (back/forward arrows, chevrons) with `rtl:-scale-x-100` or `transform: scaleX(-1)`; do NOT mirror logos, play buttons, checkmarks, or media.
- Mixed text (English names, codes, phone numbers, URLs inside Arabic): wrap in `<bdi>` or `dir="ltr"` / `unicode-bidi: isolate` so punctuation and numbers don't jump. Inputs for phone/email/URL/code: `dir="ltr"`.
- Fonts: a real Arabic font (Cairo, Tajawal, IBM Plex Sans Arabic, Noto Kufi/Naskh Arabic) with a sensible fallback; line-height ≥ 1.6 for Arabic body text; never letter-spacing on Arabic (it breaks letter joining).
- Numbers: pick one style per app (Western 0-9 is the usual choice in Iraq) and be consistent; format with `Intl.NumberFormat('ar-IQ', …)` or explicitly `'en-US'` digits as chosen. Currency: Iraqi dinar (د.ع / IQD), no decimals.
- Dates/times: `Intl.DateTimeFormat('ar-IQ', …)`; time zone Asia/Baghdad.
- Libraries (date pickers, sliders, carousels, toasts, maps controls): check they support RTL and set their rtl/direction option.

## Flutter
- `Directionality(textDirection: TextDirection.rtl)` or `locale: Locale('ar')` with `flutter_localizations`; use `EdgeInsetsDirectional`, `AlignmentDirectional`, `PositionedDirectional`.

## Unity
- Unity's default text does not shape Arabic. Use TextMeshPro with an Arabic-shaping solution (e.g. RTLTMPro / an Arabic fixer) and an Arabic font asset that includes the needed glyphs; check letters are joined and order is right-to-left.
- Mirror layout groups/anchors for RTL menus deliberately.

## Wording
- UI text in clear Modern Standard Arabic unless the user asks for Iraqi dialect; short button labels; consistent terms across screens.

## Check before saying done
Look at the screen (screenshot/browser) in RTL: alignment, icon direction, mixed-text order, numbers, overflow of long Arabic words, and that nothing is mirrored twice.