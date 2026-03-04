"use strict";

function routeProvider(cfg){
  const provider = (cfg && cfg.provider) || "resemble";
  if(provider !== "resemble"){
    return { ok:false, provider, reason:"PROVIDER_FORBIDDEN", status:403 };
  }
  return { ok:true, provider:"resemble" };
}

module.exports = { routeProvider };
