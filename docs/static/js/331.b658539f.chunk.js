(self.webpackChunkdemo_source=self.webpackChunkdemo_source||[]).push([[331],{77641:()=>{},81349:()=>{},6331:(s,e,r)=>{"use strict";r.d(e,{NodeFS:()=>c});var t=r(24973),o=r(49699),i=r(77641),n=r(81349);(0,o.j)();var c=class extends t.e{constructor(s){super(s),this.rootDir=n.resolve(s),i.existsSync(n.join(this.rootDir))||i.mkdirSync(this.rootDir)}async init(s,e){return this.pg=s,{emscriptenOpts:{...e,preRun:[...e.preRun||[],s=>{let e=s.FS.filesystems.NODEFS;s.FS.mkdir(t.d),s.FS.mount(e,{root:this.rootDir},t.d)}]}}}async closeFs(){this.pg.Module.FS.quit()}}}}]);
//# sourceMappingURL=331.b658539f.chunk.js.map