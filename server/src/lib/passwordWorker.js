// lib/password.js-ийн worker: bcrypt тооцооллыг үндсэн event loop-оос гадуур хийнэ.
import { parentPort } from 'node:worker_threads';
import bcrypt from 'bcryptjs';

parentPort.on('message', ({ id, op, password, hash, rounds }) => {
  try {
    const result = op === 'hash' ? bcrypt.hashSync(password, rounds) : bcrypt.compareSync(password, hash);
    parentPort.postMessage({ id, result });
  } catch (err) {
    parentPort.postMessage({ id, error: err.message });
  }
});
