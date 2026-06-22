Module.preRun = Module.preRun || [];
if(typeof Module.preRun == 'function') Module.preRun = [ Module.preRun ];
Module.preRun.push(() => Object.assign(ENV, Module.ENV || {}));
