"use strict";

class LruTtlCache {
  constructor({ maxItems=200, ttlMs=86400000 }={}){
    this.maxItems = Math.max(10, maxItems|0);
    this.ttlMs = Math.max(1000, ttlMs|0);
    this.map = new Map();
  }
  get(key){
    const it = this.map.get(key);
    if(!it) return null;
    if(it.exp && it.exp < Date.now()){
      this.map.delete(key);
      return null;
    }
    this.map.delete(key);
    this.map.set(key, it);
    return it.v;
  }
  set(key, value){
    const exp = Date.now() + this.ttlMs;
    if(this.map.has(key)) this.map.delete(key);
    this.map.set(key, { v:value, exp });
    this._trim();
  }
  _trim(){
    while(this.map.size > this.maxItems){
      const k = this.map.keys().next().value;
      this.map.delete(k);
    }
  }
  stats(){
    return { size: this.map.size, maxItems: this.maxItems, ttlMs: this.ttlMs };
  }
}

module.exports = { LruTtlCache };
