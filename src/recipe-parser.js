export function cleanIngredientLine(line) {
    return String(line || '')
      .replace(/^\s*(?:[-*•▪◦‣⁃]|\d+[.)](?=\s))\s*/, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

export function parseRecipeText(text) {
    const rawLines = String(text || '').replace(/\r/g, '').split('\n');
    const ingredientHeading = /^\s*(?:ingredients?|what you(?:'|’)ll need)\s*:?[\s]*$/i;
    const stopHeading = /^\s*(?:instructions?|directions?|method|preparation|steps?|notes?|nutrition|equipment)\s*:?[\s]*$/i;
    const ignoredLine = /^\s*(?:serves?|yield|prep(?:aration)? time|cook time|total time)\s*:?/i;
    const hasIngredientHeading = rawLines.some(line => ingredientHeading.test(line));
    let insideIngredients = !hasIngredientHeading;
    const ingredients = [];

    for (const rawLine of rawLines) {
      if (ingredientHeading.test(rawLine)) { insideIngredients = true; continue; }
      if (insideIngredients && stopHeading.test(rawLine)) break;
      if (!insideIngredients) continue;
      const line = cleanIngredientLine(rawLine);
      if (!line || ignoredLine.test(line)) continue;
      if (/^(?:step\s+\d+|preheat|heat|stir|mix|bake|cook|place|combine|whisk|add|pour|serve)\b/i.test(line) && /[.!]$/.test(line)) continue;
      if (line.length > 220) continue;
      ingredients.push(line);
      if (ingredients.length >= 100) break;
    }
    return ingredients;
  }

export function findRecipeJsonLd(value) {
    if (Array.isArray(value)) {
      for (const entry of value) { const found = findRecipeJsonLd(entry); if (found) return found; }
      return null;
    }
    if (!value || typeof value !== 'object') return null;
    const types = Array.isArray(value['@type']) ? value['@type'] : [value['@type']];
    if (types.some(type => String(type).toLowerCase() === 'recipe') && Array.isArray(value.recipeIngredient)) return value;
    for (const child of Object.values(value)) { const found = findRecipeJsonLd(child); if (found) return found; }
    return null;
  }

export async function importRecipeUrl(urlText, signal) {
    let url;
    try { url = new URL(urlText); } catch { throw new Error('Enter a complete recipe link beginning with http:// or https://.'); }
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Only http:// and https:// recipe links are supported.');

    let response, html;
    const controller = new AbortController();
    const abort = () => controller.abort();
    if (signal?.aborted) controller.abort();
    signal?.addEventListener('abort', abort, {once:true});
    const timeout = setTimeout(abort, 12000);
    try {
      response = await fetch(url.toString(), { headers: { Accept: 'text/html' }, signal:controller.signal });
      if (!response.ok) throw new Error(`The recipe site returned an error (${response.status}). Try pasting the ingredients instead.`);
      if (Number(response.headers.get('content-length')) > 2_000_000) throw new Error('That page is too large. Paste the ingredient list instead.');
      if (response.body) {
        const reader=response.body.getReader(),decoder=new TextDecoder();let size=0;html='';
        while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>2_000_000){await reader.cancel();throw new Error('That page is too large. Paste the ingredient list instead.');}html+=decoder.decode(value,{stream:true});}
        html+=decoder.decode();
      } else html=await response.text();
    }
    catch (error) {
      if (controller.signal.aborted) throw new Error('Import cancelled or timed out. Try again or paste the ingredients.');
      if (error instanceof TypeError) throw new Error('That site blocked direct importing. Copy its ingredient list and use Paste recipe instead.');
      throw error;
    }
    finally { clearTimeout(timeout); signal?.removeEventListener('abort', abort); }
    if (html.length > 2_000_000) throw new Error('That page is too large. Paste the ingredient list instead.');
    const page = new DOMParser().parseFromString(html, 'text/html');
    for (const script of page.querySelectorAll('script[type="application/ld+json"]')) {
      try {
        const recipe = findRecipeJsonLd(JSON.parse(script.textContent));
        if (recipe) {
          return {
            title: String(recipe.name || page.title || 'Imported recipe').trim(),
            ingredients: recipe.recipeIngredient.slice(0,100).map(cleanIngredientLine).filter(Boolean)
          };
        }
      } catch { /* Ignore malformed structured data and keep looking. */ }
    }
    const ingredients = parseRecipeText(page.body ? page.body.innerText : '');
    if (!ingredients.length) throw new Error('No structured ingredient list was found. Copy the ingredients and use Paste recipe instead.');
    return { title: page.title || 'Imported recipe', ingredients };
  }
