import { build, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath, URL } from 'node:url';
import { readFile } from 'node:fs/promises';

/** Build the same renderer once and embed it in downloads, including official motion. */
export function nativeExportPlugin(): Plugin {
  const id = '\0virtual:animate-studio-native-export';
  let cached: Promise<string> | undefined;
  async function compile() {
    const result = await build({
      configFile:false, logLevel:'error', plugins:[react(),tailwindcss()],
      resolve:{alias:{'@':fileURLToPath(new URL('../src',import.meta.url))}},
      define:{'process.env.NODE_ENV':'"production"'},
      build:{write:false,minify:true,cssCodeSplit:false,reportCompressedSize:false,
        lib:{entry:fileURLToPath(new URL('../src/export-runtime.tsx',import.meta.url)),formats:['iife'],name:'AnimateStudioNative'},
      },
    });
    const outputs = (Array.isArray(result) ? result : [result]).flatMap(item => 'output' in item ? item.output : []);
    const code = outputs.filter(item=>item.type==='chunk').map(item=>item.code).join('\n');
    const css = outputs.flatMap(item=>item.type==='asset'&&item.fileName.endsWith('.css')?[item.source]:[]).join('\n');
    if (!code || !css) throw new Error('Native export renderer or styles missing');
    const notices = await readFile(fileURLToPath(new URL('../THIRD_PARTY_NOTICES.md',import.meta.url)),'utf8');
    return `export default ${JSON.stringify({code:`/*!\n${notices.replaceAll('*/','* /')}\n*/\n${code}`,css})};`;
  }
  return {name:'animate-studio-native-export',resolveId(source){if(source==='virtual:animate-studio-native-export')return id;},
    load(source){if(source===id)return cached ??= compile();},
    watchChange(path){if(path.includes('/src/')||path.includes('/shared/'))cached=undefined;},
  };
}
