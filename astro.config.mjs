import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import { loadEnv } from 'vite';
const env=loadEnv(process.env.NODE_ENV || 'development',process.cwd(),'');
const atlas=process.env.ATLAS_UPSTREAM || env.ATLAS_UPSTREAM;
const tracking=process.env.TRACK_UPSTREAM || env.TRACK_UPSTREAM;
export default defineConfig({
 site: 'https://go.metix.ai', build: {format:'directory'}, integrations:[react()],
 server:{host:'127.0.0.1',port:4322},
 vite:{server:{proxy:{
  ...(atlas ? {'/atlas':{target:atlas,changeOrigin:true,rewrite:path=>path.replace(/^\/atlas/,'')}} : {}),
  ...(tracking ? {'/api/track':{target:tracking,changeOrigin:true}} : {}),
 }},build:{assetsInlineLimit:0}},
});
