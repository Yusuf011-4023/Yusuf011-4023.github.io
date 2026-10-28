# Yusuf Aslam · Portfolio

My personal portfolio site, live at **https://yusuf011-4023.github.io/**

Projects are loaded automatically from my public GitHub repos, so new work appears on the site without editing the code. Each project is drawn as an engineering part from its real stats (days active, size in KB, stars) as you scroll.

## Files

| File | What it is |
|---|---|
| `index.html` | The page: layout, colours and text |
| `app.js` | Settings, GitHub loading and the project drawings |
| `scrollcraft.js` / `scrollcraft.css` | The scroll engine (don't edit) |

## Editing

- **Colours and fonts:** the `:root { ... }` block at the top of the `<style>` section in `index.html`
- **Name, subtitle and About Me text:** in `index.html`, marked with `EDIT` comments
- **Username, LinkedIn, email, pinned and hidden repos:** the `CONFIG` object at the top of `app.js`

To preview locally, open `index.html` in a browser. Pushing to `main` updates the live site within a minute or two.
