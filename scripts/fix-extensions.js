import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const distDir = path.join(__dirname, '../dist');

function addJsExtensions(dir) {
  const files = fs.readdirSync(dir);
  
  for (const file of files) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    
    if (stat.isDirectory()) {
      addJsExtensions(filePath);
    } else if (file.endsWith('.js')) {
      let content = fs.readFileSync(filePath, 'utf8');
      
      // Add .js extension to relative imports that don't have extensions
      content = content.replace(
        /from\s+['"](\.\/.+?)['"](?!\.[a-zA-Z])/g,
        (match, importPath) => {
          return match.replace(importPath, importPath + '.js');
        }
      );
      
      content = content.replace(
        /from\s+['"](\.\.\/.+?)['"](?!\.[a-zA-Z])/g,
        (match, importPath) => {
          return match.replace(importPath, importPath + '.js');
        }
      );
      
      content = content.replace(
        /import\s+['"](\.\/.+?)['"](?!\.[a-zA-Z])/g,
        (match, importPath) => {
          return match.replace(importPath, importPath + '.js');
        }
      );
      
      content = content.replace(
        /import\s+['"](\.\.\/.+?)['"](?!\.[a-zA-Z])/g,
        (match, importPath) => {
          return match.replace(importPath, importPath + '.js');
        }
      );
      
      fs.writeFileSync(filePath, content);
    }
  }
}

addJsExtensions(distDir);
console.log('Added .js extensions to imports');