const { assertFails, assertSucceeds, initializeTestEnvironment } = require('@firebase/rules-unit-testing');
const fs = require('fs');

async function run() {
  const testEnv = await initializeTestEnvironment({
    projectId: 'synco-test-project-2',
    firestore: {
      rules: fs.readFileSync('firestore.rules', 'utf8'),
    },
  });

  const patientDb = testEnv.authenticatedContext('patient123', { email: 'patient@test.com' }).firestore();
  const doctorDb = testEnv.authenticatedContext('doctor456', { email: 'doctor@test.com' }).firestore();
  const outsiderDb = testEnv.authenticatedContext('stranger999', { email: 'stranger@test.com' }).firestore();

  const conversationId = 'conversation_patient123_doctor456';
  const conversationRef = patientDb.collection('conversations').doc(conversationId);

  console.log('Testing create conversation...');
  await assertSucceeds(conversationRef.set({
    participants: ['patient123', 'doctor456'],
    lastMessage: 'hello',
    updatedAt: new Date(),
    createdAt: new Date()
  }));

  console.log('Testing add message...');
  const msgRef = conversationRef.collection('messages').doc('msg1');
  await assertSucceeds(msgRef.set({
    text: 'hello',
    senderId: 'patient123',
    status: 'sent',
    createdAt: new Date()
  }));

  console.log('Testing read conversation as participant...');
  await assertSucceeds(patientDb.collection('conversations').doc(conversationId).get());
  await assertSucceeds(doctorDb.collection('conversations').doc(conversationId).get());

  console.log('Testing unauthorized user cannot read conversation...');
  await assertFails(outsiderDb.collection('conversations').doc(conversationId).get());

  console.log('Testing unauthorized user cannot create message...');
  const strangerMessageRef = outsiderDb.collection('conversations').doc(conversationId).collection('messages').doc('msg2');
  await assertFails(strangerMessageRef.set({
    text: 'not allowed',
    senderId: 'stranger999',
    status: 'sent',
    createdAt: new Date()
  }));

  console.log('ALL TESTS PASSED');
  process.exit(0);
}
run().catch(e => { console.error('TEST FAILED', e); process.exit(1); });
