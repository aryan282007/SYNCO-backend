const { assertFails, assertSucceeds, initializeTestEnvironment } = require('@firebase/rules-unit-testing');
const fs = require('fs');

async function run() {
  const testEnv = await initializeTestEnvironment({
    projectId: 'synco-test-project-3',
    firestore: {
      rules: fs.readFileSync('firestore.rules', 'utf8'),
    },
  });

  const patientDb = testEnv.authenticatedContext('patient123', { email: 'patient@test.com' }).firestore();
  
  // Test Inquiry Chat
  const chatId = 'inquiry_patient123_doctor456';
  const chatRef = patientDb.collection('chats').doc(chatId);
  
  // 1. Read before chat exists
  console.log('Testing read before chat exists by doctor...');
  const doctorDb = testEnv.authenticatedContext('doctor456', { email: 'doc@test.com' }).firestore();
  await assertSucceeds(doctorDb.collection('chats').doc(chatId).collection('messages').get());

  console.log('Testing read before chat exists by patient...');
  await assertSucceeds(patientDb.collection('chats').doc(chatId).collection('messages').get());

  // 2. Send first message (create chat)
  console.log('Testing create chat...');
  await assertSucceeds(chatRef.set({
    patientId: 'patient123',
    doctorId: 'doctor456',
    participants: ['patient123', 'doctor456'],
    lastMessage: 'hello'
  }));

  // 3. Add message
  console.log('Testing add message...');
  const msgRef = chatRef.collection('messages').doc('msg1');
  await assertSucceeds(msgRef.set({
    text: 'hello',
    senderId: 'patient123'
  }));
  
  // 4. Read messages after chat exists
  console.log('Testing read messages after chat exists by doctor...');
  await assertSucceeds(doctorDb.collection('chats').doc(chatId).collection('messages').get());

  console.log('ALL TESTS PASSED');
  process.exit(0);
}
run().catch(e => { console.error('TEST FAILED', e); process.exit(1); });
