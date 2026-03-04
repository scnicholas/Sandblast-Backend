"use strict";

class CircuitBreaker {
  constructor({ failThreshold=3, windowMs=120000, openMs=60000 }={}){
    this.failThreshold = Math.max(1, failThreshold|0);
    this.windowMs = Math.max(1000, windowMs|0);
    this.openMs = Math.max(1000, openMs|0);
    this.failures = [];
    this.openUntil = 0;
    this.lastOkAt = 0;
    this.lastFailAt = 0;
    this.lastReason = "";
  }
  isOpen(){ return Date.now() < this.openUntil; }
  noteSuccess(){
    this.lastOkAt = Date.now();
    this.lastReason = "OK";
    this._prune();
  }
  noteFailure(reason="FAIL"){
    const t = Date.now();
    this.lastFailAt = t;
    this.lastReason = String(reason||"FAIL").slice(0,80);
    this.failures.push(t);
    this._prune();
    if(this.failures.length >= this.failThreshold){
      this.openUntil = t + this.openMs;
    }
  }
  _prune(){
    const cutoff = Date.now() - this.windowMs;
    while(this.failures.length && this.failures[0] < cutoff){
      this.failures.shift();
    }
  }
  snapshot(){
    return {
      open: this.isOpen(),
      openUntil: this.openUntil || 0,
      recentFailures: this.failures.length,
      failThreshold: this.failThreshold,
      windowMs: this.windowMs,
      openMs: this.openMs,
      lastOkAt: this.lastOkAt || 0,
      lastFailAt: this.lastFailAt || 0,
      lastReason: this.lastReason || ""
    };
  }
}

module.exports = { CircuitBreaker };
