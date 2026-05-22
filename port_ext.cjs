const fs = require('fs');
const path = require('path');

const srcDir = 'E:\\DMT\\WEBAPP\\Extension 0205';
const destDir = 'e:\\DMT\\WEBAPP\\kg-cashier\\src\\views';
const destCss = path.join(destDir, 'extension.css');

// Read files
let html = fs.readFileSync(path.join(srcDir, 'popup.html'), 'utf8');
let js = fs.readFileSync(path.join(srcDir, 'popup.js'), 'utf8');
let css = fs.readFileSync(path.join(srcDir, 'popup.css'), 'utf8');

// Extract body from HTML
const bodyMatch = html.match(/<body>([\s\S]*?)<\/body>/);
let bodyContent = bodyMatch ? bodyMatch[1] : html;
// Remove <script src="popup.js"></script>
bodyContent = bodyContent.replace(/<script src="popup.js"><\/script>/, '');

// Clean up JS: Replace chrome.storage.local with standard localStorage wrapped in a mock
js = js.replace(/chrome\.storage\.local\.get\(\[(.*?)\], \((.*?)\) => {([\s\S]*?)}\);/g, (match, keysStr, callbackArg, innerCode) => {
    return `const keys = [${keysStr}];
        const result = {};
        keys.forEach(k => {
            const val = localStorage.getItem('ext_' + k);
            if(val) { try { result[k] = JSON.parse(val); } catch(e){} }
        });
        const ${callbackArg} = result;
        ${innerCode}`;
});

js = js.replace(/chrome\.storage\.local\.set\(\{(.*?)\}, \(\) => {([\s\S]*?)}\);/g, (match, keyValStr, innerCode) => {
    // A simplified replacement, might need manual tweaking later
    return `const updates = {${keyValStr}};
        Object.keys(updates).forEach(k => {
            localStorage.setItem('ext_' + k, JSON.stringify(updates[k]));
        });
        ${innerCode}`;
});

js = js.replace(/chrome\.storage\.local\.set\(\{(.*?)\}\);/g, (match, keyValStr) => {
    return `const updates = {${keyValStr}};
        Object.keys(updates).forEach(k => {
            localStorage.setItem('ext_' + k, JSON.stringify(updates[k]));
        });`;
});

// Remove DOMContentLoaded wrapper
js = js.replace(/document\.addEventListener\('DOMContentLoaded', \(\) => {([\s\S]*)\n}\);/, '$1');

// Wrap in kg-cashier view structure
const finalJs = `import './extension.css';

export function render() {
    return \`<div class="ext-wrapper">${bodyContent}</div>\`;
}

export function init() {
    const extWrapper = document.querySelector('.ext-wrapper');
    if(!extWrapper) return;
    
    // Bind all document.getElementById/querySelector to search within extWrapper instead of global document
    const $ = (selector) => extWrapper.querySelector(selector);
    const $$ = (selector) => extWrapper.querySelectorAll(selector);

    // Provide mock chrome.windows
    const chrome = { windows: { create: (opts) => window.open(opts.url, '_blank', \`width=\${opts.width},height=\${opts.height}\`) }, runtime: { getURL: (path) => path } };

    ${js.replace(/document\.getElementById\((.*?)\)/g, '$( $1 )')
        .replace(/document\.querySelector\((.*?)\)/g, '$( $1 )')
        .replace(/document\.querySelectorAll\((.*?)\)/g, '$$$( $1 )')}
}

export function destroy() {
    // Cleanup if necessary
}
`;

fs.writeFileSync(path.join(destDir, 'extension.js'), finalJs, 'utf8');

// Prefix CSS with .ext-wrapper to avoid global conflicts
let scopedCss = css.replace(/^([a-zA-Z0-9_#\.:][^{]*){/gm, (match) => {
    if (match.includes('@') || match.includes(':root') || match.includes('body')) return match;
    return '.ext-wrapper ' + match;
});
scopedCss = scopedCss.replace(/body \{/g, '.ext-wrapper {');
fs.writeFileSync(destCss, scopedCss, 'utf8');

console.log("Ported extension to kg-cashier!");
