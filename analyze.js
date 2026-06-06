import fs from 'fs';
import path from 'path';

const rootDir = process.cwd();
const excludedDirs = ['node_modules', '.git', '.workspace', '.gemini'];
const targetFiles = [];

function walkDir(dir) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
        if (excludedDirs.includes(file)) continue;
        const filePath = path.join(dir, file);
        const stat = fs.statSync(filePath);
        if (stat.isDirectory()) {
            walkDir(filePath);
        } else {
            targetFiles.push(filePath);
        }
    }
}

walkDir(rootDir);

let markdown = `# Codebase Analysis Report\n\n`;

for (const file of targetFiles) {
    const relPath = path.relative(rootDir, file);
    if (file.endsWith('all_code.txt') || file.endsWith('analyze.js') || file.endsWith('bun.lock') || file.endsWith('package-lock.json')) {
        continue;
    }
    
    let content;
    try {
        content = fs.readFileSync(file, 'utf8');
    } catch (e) {
        markdown += `### ${relPath}\n- **Status**: Binary or Unreadable\n\n`;
        continue;
    }

    if (content.trim().length === 0) {
        markdown += `### ${relPath}\n- **Status**: Empty File\n\n`;
        continue;
    }

    const issues = [];
    if (content.includes('AF Tiles') || content.includes('AF ')) {
        issues.push('Contains potential brand reference "AF Tiles" or "AF"');
    }
    if (content.match(/password\s*[:=]\s*["'][^"']+["']/i)) {
        issues.push('Contains potential hardcoded password');
    }
    if (content.match(/secret\s*[:=]\s*["'][^"']+["']/i)) {
        issues.push('Contains potential hardcoded secret');
    }
    if (content.match(/(supabase\.co|supabase\.in).*anon.*key/i)) {
        issues.push('Contains Supabase Anon Key reference');
    }
    if (content.includes('Sheikh Kaif Sadiq')) {
        issues.push('Contains author reference "Sheikh Kaif Sadiq"');
    }
    
    const lines = content.split('\n').length;

    markdown += `### ${relPath}\n`;
    markdown += `- **Lines of Code**: ${lines}\n`;
    if (issues.length > 0) {
        markdown += `- **Findings**:\n`;
        issues.forEach(issue => {
            markdown += `  - ${issue}\n`;
        });
    } else {
        markdown += `- **Status**: Clean / No immediate sensitive data or branding found.\n`;
    }
    markdown += `\n`;
}

fs.writeFileSync('analysis_results.md', markdown);
console.log('Analysis complete. Results written to analysis_results.md');
