/**
 * Nyx TTS Engine — Hardened Production Version
 * Eliminates most Render 500 / 503 failures
 */

const fetch = require("node-fetch");

/* ===============================
   CONFIGURATION
================================ */

const PROVIDER_TIMEOUT = 5000;
const MAX_CONCURRENT = 3;
const CIRCUIT_LIMIT = 5;
const CIRCUIT_RESET = 30000;

const RESEMBLE_API_KEY = process.env.RESEMBLE_API_KEY;
const RESEMBLE_PROJECT_UUID = process.env.RESEMBLE_PROJECT_UUID;
const RESEMBLE_VOICE_UUID = process.env.RESEMBLE_VOICE_UUID;

/* ===============================
   STATE
================================ */

let activeRequests = 0;
let failCount = 0;
let circuitOpenUntil = 0;

/* ===============================
   UTILITIES
================================ */

function sleep(ms){
  return new Promise(r => setTimeout(r, ms));
}

function timeout(ms){
  return new Promise((_,reject)=>
    setTimeout(()=>reject(new Error("TTS timeout")),ms)
  );
}

function circuitOpen(){
  return Date.now() < circuitOpenUntil;
}

function recordFailure(){

  failCount++;

  if(failCount >= CIRCUIT_LIMIT){

    circuitOpenUntil = Date.now() + CIRCUIT_RESET;

    console.warn("[TTS] Circuit breaker OPEN");

  }

}

function recordSuccess(){

  failCount = 0;

}

/* ===============================
   RESEMBLE PROVIDER
================================ */

async function generateResemble(text){

  if(!RESEMBLE_API_KEY || !RESEMBLE_PROJECT_UUID || !RESEMBLE_VOICE_UUID){

    throw new Error("Missing Resemble credentials");

  }

  const endpoint = `https://app.resemble.ai/api/v2/projects/${RESEMBLE_PROJECT_UUID}/clips`;

  const response = await Promise.race([

    fetch(endpoint,{
      method:"POST",
      headers:{
        "Authorization":`Token ${RESEMBLE_API_KEY}`,
        "Content-Type":"application/json"
      },
      body:JSON.stringify({
        voice_uuid:RESEMBLE_VOICE_UUID,
        body:text
      })
    }),

    timeout(PROVIDER_TIMEOUT)

  ]);

  if(!response.ok){

    throw new Error(`Provider error ${response.status}`);

  }

  const data = await response.json();

  if(!data || !data.audio_src){

    throw new Error("Invalid TTS response");

  }

  return data.audio_src;

}

/* ===============================
   MAIN GENERATOR
================================ */

async function generate(text){

  if(!text){

    return { ok:false, reason:"empty_text" };

  }

  if(activeRequests >= MAX_CONCURRENT){

    return { ok:false, reason:"concurrency_limit" };

  }

  if(circuitOpen()){

    return { ok:false, reason:"circuit_open" };

  }

  activeRequests++;

  try{

    const audioUrl = await generateResemble(text);

    recordSuccess();

    return {

      ok:true,
      provider:"resemble",
      audio:audioUrl

    };

  }catch(err){

    recordFailure();

    console.warn("[TTS] fail-open:",err.message);

    return {

      ok:false,
      reason:err.message

    };

  }finally{

    activeRequests--;

  }

}

/* ===============================
   HEALTH CHECK
================================ */

function health(){

  return {

    activeRequests,
    failCount,
    circuitOpen:circuitOpen(),
    circuitReset:circuitOpenUntil

  };

}

/* ===============================
   EXPORT
================================ */

module.exports = {

  generate,
  health

};
