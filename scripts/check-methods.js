// Detecta chamadas a métodos que não existem — a classe de bug do antigo
// this.hideCursorPreviews(): o nome errado só estoura em runtime, no caminho que o chama, e o
// ESLint não pega (no-undef não olha propriedades). Confere:
//   - this.X(…) nos arquivos do FlowAnimator (flow-animator.js + fa-*.js) e em cada class;
//   - fa.X(…) / flowAnimator.X(…) / this.animator.X(…) (FlowAnimator) em qualquer arquivo;
//   - ….timeline.X(…) (TimelinePro), ….inspector.X(…) (Inspector), this.audio.X(…) (AudioEngine).
// Um nome conta como existente se for método/campo da classe ou do FlowAnimator.prototype,
// ou se for atribuído em algum lugar (this.X = …, fa.X = …) — propriedades que guardam funções.
const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, '..', 'js');
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.js'));

// Remove comentários e o conteúdo de strings/templates simples, preservando as quebras de
// linha (para os números de linha continuarem certos)
function strip(src) {
    let out = '';
    let i = 0;
    while (i < src.length) {
        const c = src[i], n = src[i + 1];
        if (c === '/' && n === '/') {
            while (i < src.length && src[i] !== '\n') i++;
        } else if (c === '/' && n === '*') {
            i += 2;
            while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) { if (src[i] === '\n') out += '\n'; i++; }
            i += 2;
        } else if (c === '"' || c === "'" || c === '`') {
            out += c;
            i++;
            while (i < src.length && src[i] !== c) {
                if (src[i] === '\\') i++;
                else if (src[i] === '\n') out += '\n';
                i++;
            }
            out += c;
            i++;
        } else {
            out += c;
            i++;
        }
    }
    return out;
}

const sources = new Map(files.map((f) => [f, strip(fs.readFileSync(path.join(dir, f), 'utf8'))]));
const isFaFile = (f) => f === 'flow-animator.js' || /^fa-.*\.js$/.test(f);
const ID = '[A-Za-z_$][\\w$]*';

// Membros de cada class (métodos, getters/setters, campos e estáticos, no nível 1 do corpo)
function classMembers(src) {
    const classes = new Map();
    const re = new RegExp(`^class (${ID})`, 'gm');
    let m;
    while ((m = re.exec(src))) {
        const start = src.indexOf('{', m.index);
        let depth = 0, end = start;
        for (let i = start; i < src.length; i++) {
            if (src[i] === '{') depth++;
            else if (src[i] === '}' && --depth === 0) { end = i; break; }
        }
        const body = src.slice(start + 1, end);
        const members = new Set();
        let d = 0, lineStart = true, line = '';
        for (const ch of body) {
            if (ch === '\n') {
                if (lineStart) {
                    const mm = new RegExp(`^\\s*(?:static\\s+)?(?:async\\s+)?\\*?(?:(?:get|set)\\s+)?(#?${ID})\\s*(?:\\(|=)`).exec(line);
                    if (mm) members.add(mm[1]);
                }
                line = '';
                lineStart = d === 0;
                continue;
            }
            if (ch === '{') d++;
            else if (ch === '}') d--;
            line += ch;
        }
        classes.set(m[1], { members, start, end });
    }
    return classes;
}

// FlowAnimator: prototype/estáticos + tudo que é atribuído em instâncias
const fa = new Set();
const classes = new Map();
for (const [file, src] of sources) {
    for (const m of src.matchAll(new RegExp(`FlowAnimator(?:\\.prototype)?\\.(${ID})\\s*=(?!=)`, 'g'))) fa.add(m[1]);
    for (const m of src.matchAll(new RegExp(`\\b(?:fa|flowAnimator|this\\.animator)\\.(${ID})\\s*=(?!=)`, 'g'))) fa.add(m[1]);
    if (isFaFile(file)) {
        for (const m of src.matchAll(new RegExp(`\\bthis\\.(${ID})\\s*=(?!=)`, 'g'))) fa.add(m[1]);
    }
    for (const [name, info] of classMembers(src)) {
        const body = src.slice(info.start, info.end);
        for (const m of body.matchAll(new RegExp(`\\bthis\\.(${ID})\\s*=(?!=)`, 'g'))) info.members.add(m[1]);
        classes.set(name, { ...info, file });
    }
}

const lineOf = (src, idx) => src.slice(0, idx).split('\n').length;
const problems = [];
const check = (file, src, re, set, label, accept) => {
    for (const m of src.matchAll(re)) {
        const name = m[1];
        if (set.has(name) || (accept && accept(m.index))) continue;
        problems.push(`${file}:${lineOf(src, m.index)}  ${label}.${name}() não existe`);
    }
};
const members = (cls) => (classes.get(cls) ? classes.get(cls).members : new Set());

for (const [file, src] of sources) {
    const fileClasses = [...classes.values()].filter((c) => c.file === file);
    const inClass = (idx) => fileClasses.find((c) => idx > c.start && idx < c.end);

    // this.X( — dentro de uma class confere com a própria class; nos arquivos do FlowAnimator
    // (fora de class) confere com o FlowAnimator. Objetos literais com métodos (ex.: ProjectSchema,
    // Util, Theme) chamam this.X( dos próprios membros: aceitos se X for chave do objeto no arquivo.
    const literalKeys = new Set([...src.matchAll(new RegExp(`^\\s+(?:async\\s+)?(${ID})\\s*(?:\\([^)]*\\)\\s*\\{|:\\s*(?:async\\s+)?(?:function\\b|\\())`, 'gm'))].map((m) => m[1]));
    for (const m of src.matchAll(new RegExp(`\\bthis\\.(${ID})\\s*\\(`, 'g'))) {
        const cls = inClass(m.index);
        const name = m[1];
        if (cls) {
            if (!cls.members.has(name)) problems.push(`${file}:${lineOf(src, m.index)}  this.${name}() não existe na class`);
        } else if (isFaFile(file)) {
            if (!fa.has(name) && !literalKeys.has(name)) problems.push(`${file}:${lineOf(src, m.index)}  this.${name}() não existe no FlowAnimator`);
        }
    }
    check(file, src, new RegExp(`\\b(?<![.\\w$])(?:fa|flowAnimator)\\.(${ID})\\s*\\(`, 'g'), fa, 'FlowAnimator');
    check(file, src, new RegExp(`\\bthis\\.animator\\.(${ID})\\s*\\(`, 'g'), fa, 'FlowAnimator');
    check(file, src, new RegExp(`\\.timeline\\.(${ID})\\s*\\(`, 'g'), members('TimelinePro'), 'TimelinePro');
    check(file, src, new RegExp(`\\.inspector\\.(${ID})\\s*\\(`, 'g'), members('Inspector'), 'Inspector');
    check(file, src, new RegExp(`\\bthis\\.audio\\.(${ID})\\s*\\(`, 'g'), members('AudioEngine'), 'AudioEngine');
}

if (problems.length) {
    for (const p of problems) console.error(p);
    process.exit(1);
}
console.log(`OK — chamadas conferidas contra ${fa.size} membros do FlowAnimator e ${classes.size} classes.`);
