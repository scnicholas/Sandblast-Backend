"use strict";

class InflightLimiter {
  constructor(max=2){
    this.max = Math.max(1, max|0);
    this.inflight = 0;
  }
  canEnter(){ return this.inflight < this.max; }
  enter(){ this.inflight++; }
  exit(){ this.inflight = Math.max(0, this.inflight-1); }
  snapshot(){ return { inflight: this.inflight, max: this.max }; }
}

module.exports = { InflightLimiter };
