const fs = require('fs');

const filePath = './start.hsp';
const outPath = './output.csv';

const content = fs.readFileSync(filePath, 'utf8');
const lines = content.split(/\r?\n/);

let recordsMap = {}; // key: dbid, value: record
let records = [];    // 保持顺序

let currentDbid = null;
let collectingDesc = false;
let descIndex = null;
let descBuffer = [];

let insideDbmode17 = false;
let insideJp = false;
let insideDbmode10or3 = false;
let insideDbmode3 = false;

// 用于收集所有出现的 inv 索引
let allInvIndices = new Set();

for (let i = 0; i < lines.length; i++) {
    let line = lines[i].trim();

    // dbid
    let dbidMatch = line.match(/^if\s*\(\s*dbid\s*==\s*(\d+)\s*\)/);
    if (dbidMatch) {
        currentDbid = dbidMatch[1];
        if (!recordsMap[currentDbid]) {
            const rec = {
                dbid: currentDbid,
                reftype: '',
                reftypeminor: '',
                description0: '',
                description1: '',
                description2: '',
                description3: ''
                // inv 属性会动态添加
            };
            recordsMap[currentDbid] = rec;
            records.push(rec); // 保持顺序
        }
        insideDbmode17 = false;
        insideJp = false;
        insideDbmode10or3 = false;
        insideDbmode3 = false;
        continue;
    }

    if (!currentDbid) continue;

    // dbmode
    let dbmodeMatch = line.match(/^if\s*\(\s*dbmode\s*==\s*(\d+)\s*(?:\|\s*dbmode\s*==\s*(\d+))?/);
    if (dbmodeMatch) {
        let dbmodeNum1 = parseInt(dbmodeMatch[1]);
        let dbmodeNum2 = dbmodeMatch[2] ? parseInt(dbmodeMatch[2]) : null;
        
        insideDbmode17 = (dbmodeNum1 === 17 || dbmodeNum2 === 17);
        insideDbmode10or3 = (dbmodeNum1 === 10 || dbmodeNum1 === 3 || dbmodeNum2 === 10 || dbmodeNum2 === 3);
        insideDbmode3 = (dbmodeNum1 === 3 || dbmodeNum2 === 3);
        
        insideJp = false;
        continue;
    }

    // 处理大括号结束
    if (line === '}') {
        insideDbmode10or3 = false;
        insideDbmode3 = false;
        continue;
    }

    // reftype / reftypeminor，只取第一次
    let reftypeMatch = line.match(/reftype\s*=\s*(\d+)/);
    if (reftypeMatch && !recordsMap[currentDbid].reftype) {
        recordsMap[currentDbid].reftype = reftypeMatch[1];
        continue;
    }

    let reftypeminorMatch = line.match(/reftypeminor\s*=\s*(\d+)/);
    if (reftypeminorMatch && !recordsMap[currentDbid].reftypeminor) {
        recordsMap[currentDbid].reftypeminor = reftypeminorMatch[1];
        continue;
    }

    // 收集装备信息 (dbmode == 10 | dbmode == 3)
    if (insideDbmode10or3) {
        let invMatch = line.match(/inv\((\d+),\s*ci\)\s*=\s*(.+)/);
        if (invMatch) {
            const invIndex = invMatch[1];
            const invValue = invMatch[2].trim();
            
            // 记录所有出现的 inv 索引
            allInvIndices.add(invIndex);
            
            // 动态添加到记录中
            if (!recordsMap[currentDbid].hasOwnProperty(`inv${invIndex}`)) {
                recordsMap[currentDbid][`inv${invIndex}`] = '';
            }
            recordsMap[currentDbid][`inv${invIndex}`] = invValue;
        }
        continue;
    }

    // 收集魔杖信息 (dbmode == 3 中的 inv(9, ci))
    if (insideDbmode3) {
        let inv9Match = line.match(/inv\(9,\s*ci\)\s*=\s*(.+)/);
        if (inv9Match) {
            const invValue = inv9Match[1].trim();
            
            // 记录 inv9 索引
            allInvIndices.add('9');
            
            // 动态添加到记录中
            if (!recordsMap[currentDbid].hasOwnProperty('inv9')) {
                recordsMap[currentDbid]['inv9'] = '';
            }
            recordsMap[currentDbid]['inv9'] = invValue;
            continue;
        }
    }

    // dbmode==17 && jp 的 description
    if (insideDbmode17) {
        if (line.match(/^if\s*\(\s*jp\s*\)/)) {
            insideJp = true;
            continue;
        }
        if (line.match(/^else/)) {
            insideJp = false;
            continue;
        }
    }

    if (insideDbmode17 && insideJp) {
        let descMatch = line.match(/description\((\d+)\)\s*=\s*"(.*)/);
        if (descMatch) {
            descIndex = descMatch[1];
            let firstLine = descMatch[2];
            if (firstLine.endsWith('"')) {
                let val = firstLine.slice(0, -1);
                let old = recordsMap[currentDbid]['description' + descIndex];
                recordsMap[currentDbid]['description' + descIndex] = old ? old + '\\n' + val : val;
            } else {
                collectingDesc = true;
                descBuffer.push(firstLine);
            }
            continue;
        }

        if (collectingDesc) {
            if (line.endsWith('"')) {
                descBuffer.push(line.slice(0, -1));
                let val = descBuffer.join('\\n');
                let old = recordsMap[currentDbid]['description' + descIndex];
                recordsMap[currentDbid]['description' + descIndex] = old ? old + '\\n' + val : val;

                collectingDesc = false;
                descBuffer = [];
                descIndex = null;
            } else {
                descBuffer.push(line);
            }
        }
    }
}

// 将 allInvIndices 转换为排序后的数组
const sortedInvIndices = Array.from(allInvIndices).sort((a, b) => parseInt(a) - parseInt(b));
console.log('发现的所有 inv 索引:', sortedInvIndices);

// 根据reftype值筛选数据
const filteredRecords = records.filter(record => {
    const reftypeNum = parseInt(record.reftype) || 0;
    
    // 只保留装备或魔杖的记录
    return (reftypeNum >= 10000 && reftypeNum < 30000) || reftypeNum === 56000;
});

// 为所有记录确保包含所有 inv 字段
filteredRecords.forEach(record => {
    sortedInvIndices.forEach(index => {
        const fieldName = `inv${index}`;
        if (!record.hasOwnProperty(fieldName)) {
            record[fieldName] = '';
        }
    });
});

// 构建 CSV 头部
const baseHeaders = [
    'dbid', 'reftype', 'reftypeminor', 
    'description0', 'description1', 'description2', 'description3'
];

// 动态添加 inv 头部
const invHeaders = sortedInvIndices.map(index => `inv${index}`);
const headers = [...baseHeaders, ...invHeaders];

// 写 CSV
const csvContent = [
    headers.join(','),
    ...filteredRecords.map(r => headers.map(h => {
        const value = r[h] || '';
        // 处理包含逗号或引号的值
        if (value.includes(',') || value.includes('"')) {
            return `"${value.replace(/"/g, '""')}"`;
        }
        return value;
    }).join(','))
].join('\n');

fs.writeFileSync(outPath, csvContent, 'utf8');

console.log('CSV 已生成，只包含装备和魔杖：', outPath);
console.log('装备 (reftype >= 10000 && < 30000) 包含 dbmode == 10 | dbmode == 3 分支的 inv 赋值');
console.log('魔杖 (reftype == 56000) 包含 dbmode == 3 分支的 inv(9, ci) 赋值');
console.log('总共发现', sortedInvIndices.length, '种不同的 inv 索引');