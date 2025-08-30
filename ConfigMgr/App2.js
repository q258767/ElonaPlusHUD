const fs = require('fs');

const filePath = './start2.hsp';
const outPath = './output2.csv';

const content = fs.readFileSync(filePath, 'utf8');
const lines = content.split(/\r?\n/);

let records = {};
let currentId = null;
let insideJp = false;
let insideElse = false;

for (let line of lines) {
    line = line.trim();

    // 检测 if ( jp )
    if (line.match(/^if\s*\(\s*jp\s*\)/)) {
        insideJp = true;
        insideElse = false;
        continue;
    }
    // 检测 else
    if (line.match(/^else/)) {
        insideJp = false;
        insideElse = true;
        continue;
    }

    // 提取 ioriginalnameref(id) = "xxx"
    let match = line.match(/ioriginalnameref\((\d+)\)\s*=\s*"(.*)"/);
    if (match) {
        let id = match[1];
        let name = match[2];

        if (!records[id]) {
            records[id] = { dbid: id, jp_name: '', en_name: '' };
        }

        if (insideJp) {
            records[id].jp_name = name;
        } else if (insideElse) {
            records[id].en_name = name;
        }
    }
}

// 写 CSV
const headers = ['dbid','jp_name','en_name'];
const csvContent = [
    headers.join(','),
    ...Object.values(records).map(r => headers.map(h => `"${r[h]}"`).join(','))
].join('\n');

fs.writeFileSync(outPath, csvContent, 'utf8');

console.log('CSV 已生成：', outPath);
