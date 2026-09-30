import test from 'node:test';
import assert from 'node:assert/strict';
import { subtract } from '../src/alpha-sample.js';
test('subtract handles positive and negative results', () => { assert.equal(subtract(5,3),2); assert.equal(subtract(0,4),-4); });
