const fs = require('fs');

async function testDeepgram() {
  try {
    const key = process.env.DEEPGRAM_API_KEY || '11edef9c1088d380ca501955f860d23b3fb0b389';
    // try a random audio file or just an empty request
    const res = await fetch('https://api.deepgram.com/v1/listen?model=nova-3&language=vi', {
      method: 'POST',
      headers: {
        'Authorization': `Token ${key}`,
        'Content-Type': 'audio/wav',
      },
      body: Buffer.from([]), // empty body just to test auth & model validity
    });
    console.log(res.status, await res.text());
  } catch (e) {
    console.error(e);
  }
}

testDeepgram();
