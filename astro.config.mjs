import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import node from '@astrojs/node';
import { loadEnv } from 'vite';
const env=loadEnv(process.env.NODE_ENV || 'development',process.cwd(),'');
const peerRankApiBase=process.env.NEXT_PUBLIC_API_BASE || env.NEXT_PUBLIC_API_BASE;
if (peerRankApiBase && !process.env.NEXT_PUBLIC_API_BASE) process.env.NEXT_PUBLIC_API_BASE=peerRankApiBase;
export default defineConfig({
 site: 'https://go.metix.ai', build: {format:'directory'}, integrations:[react()], adapter:node({mode:'standalone'}),
 server:{host:'127.0.0.1',port:4322},
 vite:{server:{proxy:{
  ...(peerRankApiBase ? {'/bapi':{
   target:peerRankApiBase,
   changeOrigin:true,
   rewrite:(path)=>path.replace(/^\/bapi(?=\/|$)/,'/hire/bapi'),
  }} : {}),
  ...(peerRankApiBase ? {'/api/track':{
   target:peerRankApiBase,
   changeOrigin:true,
   rewrite:(path)=>path.replace(/^\/api\/track(?=\/|$)/,'/hire/api/track'),
  }} : {}),
 }},build:{assetsInlineLimit:0}},
});
