// Detecta métodos definidos mais de uma vez no FlowAnimator.prototype (espalhado por vários
// arquivos js/fa-*.js). Em JavaScript a segunda definição sobrescreve a primeira em silêncio —
// o histórico do projeto já teve dois casos assim. (Métodos de classe duplicados são pegos
// pelo ESLint: no-dupe-class-members.)
const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, '..', 'js');
const seen = new Map();
const re = /^\s*(FlowAnimator(?:\.prototype)?)\.([A-Za-z_$][\w$]*)\s*=(?!=)/gm;
for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.js'))) {
    const src = fs.readFileSync(path.join(dir, file), 'utf8');
    let m;
    while ((m = re.exec(src))) {
        const key = `${m[1]}.${m[2]}`;
        const line = src.slice(0, m.index).split('\n').length;
        if (!seen.has(key)) seen.set(key, []);
        seen.get(key).push(`${file}:${line}`);
    }
}
const dups = [...seen.entries()].filter(([, locs]) => locs.length > 1);
if (dups.length) {
    for (const [key, locs] of dups) console.error(`Duplicado: ${key} → ${locs.join(', ')}`);
    process.exit(1);
}
console.log(`OK — ${seen.size} definições em FlowAnimator, nenhuma duplicada.`);
