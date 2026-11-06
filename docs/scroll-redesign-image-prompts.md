# OsMark scroll redesign: image prompts

Three photoreal scenes that the new scroll site is built around. The references
from OSMOS are only for mood and framing. Every image must show **OsMark's own
site and brand**, not theirs.

## Which model to use

**ChatGPT Images 2.0 (GPT Image 2)**, inside ChatGPT. Attach the screenshot to the
same message as the prompt. It is the strongest of the current models at
following a reference image and keeping on-screen text and UI legible, which is
what these scenes depend on.

Backup: **Nano Banana 2 / Pro in Gemini**. It tends to give slightly more natural
skin and hands, so try it for Scene 3 if the ChatGPT hands look off.

## How to get good results

1. **One scene per chat.** Start a fresh chat for each prompt so styles don't bleed.
2. **Always attach the screenshot** listed for that scene. They are in
   `screens/` next to this file (desktop-hero.png, mobile-hero.png).
3. **Ask for the widest size.** Say "landscape, highest resolution" (or "portrait"
   for the phone scene).
4. **Make two versions of every device scene:** one with the screenshot on the
   screen, and one with a flat green screen (prompt at the end). On the site I
   will place the real, sharp, live screenshot onto the green screen in code, so
   the text is never blurry and we never have to regenerate the image when the
   site changes. The version with the screenshot is still useful as a preview.
5. **No text in the images** apart from what is on the device screens. Headlines
   go in real HTML on top.
6. If the model rewrites the screen text, reply with:
   *"Keep the scene identical. Replace only the screen content with the attached
   screenshot, pixel for pixel, with no changes to its text, logo or layout."*

## Shared style block

Paste this at the top of **every** prompt, word for word. It is what makes the
separate images look like one shoot.

```
STYLE: Premium photorealistic product photography, shot on a full-frame camera with a 50mm lens at f/2.8, cinematic and moody. Colour palette strictly: deep midnight navy (#050B1A to #0B1630), warm champagne gold (#E9CB8B) for highlights and rim light, and a single crimson red accent (#D62839) used sparingly. Low-key lighting with soft falloff, rich shadows, subtle film grain, realistic reflections and materials. No orange, no bright white backgrounds, no text, no logos except what is on the device screen, no watermarks.
```

---

## Scene 1: Hero laptop (first load)

Attach: `desktop-hero.png`

```
[STYLE BLOCK]

SCENE: A moody, minimal photo studio. A modern space-grey laptop sits open at a three-quarter angle on the top step of a set of large, stepped plinths made of dark navy stone with a fine matte texture. Behind it, a heavy deep-navy velvet curtain falls in soft vertical folds, lit from the upper left by a warm champagne-gold spotlight that grazes the folds and leaves a soft pool of light. A faint crimson glow rises from below the right edge of the frame. The laptop screen is bright and shows the attached screenshot exactly as it is, filling the display edge to edge, with the same text, logo, colours and layout, nothing redrawn or changed. Natural screen glow spills onto the keyboard and the plinth. Shallow depth of field, the back of the studio falls into darkness. Leave generous empty dark space on the left third of the frame for a headline. Wide landscape composition, 16:9, highest resolution.
```

**Extra layer for depth (recommended):** in the same chat, ask:

```
Now give me the exact same scene, same camera, same lighting, but with the laptop removed, so only the plinths and curtain remain.
```

That clean background lets the laptop float above it with a slight parallax as
you scroll.

---

## Scene 2a: Marketing shoot (behind the scenes)

No attachment needed. Make two or three of these; they become a short sequence.

**Shot A, product campaign:**

```
[STYLE BLOCK]

SCENE: Behind the scenes of a high-end product photo shoot in a dark studio. A photographer in black clothing, seen from behind and slightly to the side, aims a mirrorless camera at a perfume bottle standing on a small navy plinth under a gold-tinted softbox. A laptop on a rolling cart shows the shot being tethered. Light stands, a large octabox and black flags frame the set. The scene is mostly in shadow with the product brilliantly lit. Faces are not the focus. Wide landscape, 16:9.
```

**Shot B, social content shoot:**

```
[STYLE BLOCK]

SCENE: A content creator filming a vertical social video in a stylish dark studio corner. A phone on a small gimbal held by a crew member in the foreground, softly out of focus. The creator, in a cream knit sweater, holds a skincare product toward the phone and smiles mid-sentence. A ring of warm gold practical lights in the background makes soft bokeh, one crimson LED tube on the back wall. Candid, energetic, real. Wide landscape, 16:9.
```

**Shot C, the team at work:**

```
[STYLE BLOCK]

SCENE: Overhead view of a dark navy table during a creative review. Printed campaign photos, colour swatches in navy, gold and red, a tablet showing a moodboard, a camera body, a coffee cup, and two pairs of hands pointing at and arranging the prints. A single warm gold pendant light from above, everything around it falls into shadow. Landscape, 16:9.
```

---

## Scene 2b: Apps OsMark has made

Attach: one screenshot for each app (2 to 4 phone screenshots, portrait). Name
them app1, app2, app3, app4 in the message.

```
[STYLE BLOCK]

SCENE: Four modern frameless smartphones with thin black bezels floating in a staggered row against a seamless deep crimson-to-navy gradient backdrop, each tilted slightly differently, the second and fourth slightly lower than the first and third, as if hanging in space. Each phone shows one of the attached app screenshots exactly, left to right in order app1, app2, app3, app4, filling the screen with the same text, colours and layout, nothing redrawn. Soft champagne-gold rim light on the phone edges, gentle shadows beneath each phone, realistic glass reflections. Wide landscape, 16:9, highest resolution.
```

If you have only two or three apps, change "Four" and the order list to match.

---

## Scene 3: Someone using the site on a phone

Attach: `mobile-hero.png`

```
[STYLE BLOCK]

SCENE: Close-up of a young woman's hands holding a modern black smartphone in portrait, in a dim, warm living room in the evening. Her right index finger is lightly touching the screen as if scrolling. Natural, well-groomed nails in a soft nude colour. The phone screen shows the attached screenshot exactly, filling the display edge to edge, with the same text, logo, colours and layout, nothing redrawn or changed. The screen is the brightest thing in the frame and casts a soft glow on her fingers. The background is a softly out-of-focus navy sofa and a warm gold lamp making round bokeh. Realistic skin texture, correct anatomy with five fingers on each hand. Landscape, 16:9, highest resolution.
```

Also make a **portrait 9:16** version of this one (change the last line). Phones
get their own composition on the site instead of a squeezed desktop image.

---

## Green-screen versions (for compositing the live site)

For Scene 1, Scene 2b and Scene 3, open the chat where you made the image you
like and send:

```
Keep this exact image, same camera, lighting, device position and reflections. Replace only what is shown on the screen with a flat, evenly lit pure green (#00FF00) with no text and no reflections on it.
```

Send me both versions of each image, and I'll handle the rest in code.
