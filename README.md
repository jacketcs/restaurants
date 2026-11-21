# Berkeley Restaurant Inspections Explorer

A static page for searching and browsing the City of Berkeley's latest restaurant inspection results. There's no build step and no server code. It's plain HTML, CSS and JavaScript, and d3 is bundled in `vendor/`.

## Files

```
index.html                         the page
styles.css                         styles (follows the visitor's light/dark setting)
app.js                             loads the CSV, works out the numbers, draws the page
vendor/d3.v7.min.js                d3 v7.9.2 (ISC license, see vendor/d3-LICENSE.txt)
data/restaurant-inspections.csv    the inspection data
```

## Putting it on your site

Copy the whole folder into your repository, e.g. as `/restaurant-inspections/`, and push. It will then be at `https://<your-site>/restaurant-inspections/`. All paths are relative, so it works in any subfolder and on GitHub Pages, Netlify and similar hosts.

## Previewing locally

Browsers won't load the CSV when you open `index.html` straight from disk (`file://`), so run a small server from inside the folder:

```
python3 -m http.server 8000
```

Then open http://localhost:8000.

## Updating the data

Replace `data/restaurant-inspections.csv` with a newer export that has the same columns and file name, then push. All the numbers, charts and the "data pulled" date are worked out from the file when the page loads. Only the "About this data" notes in `index.html` are written by hand: they mention specific duplicate rows and say that no major violations appear, so check them after an update.
