import {execFileSync} from 'node:child_process';
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
const output=resolve(process.argv.slice(2).find(value=>value!=='--')??'artifacts/manys-runtime-0.1.0');
execFileSync('pnpm',['--filter','@dome/manys-runtime','build'],{stdio:'inherit'});
execFileSync('pnpm',['--filter','@dome/manys-runtime','deploy','--prod','--ignore-scripts','--frozen-lockfile','--config.inject-workspace-packages=true',output],{stdio:'inherit'});
mkdirSync(output,{recursive:true});
writeFileSync(resolve(output,'runtime-manifest.json'),JSON.stringify({name:'@dome/manys-runtime',version:'0.1.0',protocol:1,revision:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim()},null,2)+'\n');
