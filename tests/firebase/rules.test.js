const { initializeTestEnvironment, assertFails, assertSucceeds } = require('@firebase/rules-unit-testing');
const fs = require('fs');

let testEnv;

beforeAll(async () => {
  // Initialize the test environment to connect to local emulator
  testEnv = await initializeTestEnvironment({
    projectId: 'synco-test-project',
    firestore: {
      rules: fs.readFileSync('firestore.rules', 'utf8'),
      host: '127.0.0.1',
      port: 8080
    },
    storage: {
      rules: fs.readFileSync('storage.rules', 'utf8'),
      host: '127.0.0.1',
      port: 9199
    }
  });
});

beforeEach(async () => {
  // Clear the database between tests
  await testEnv.clearFirestore();
  await testEnv.clearStorage();
});

afterAll(async () => {
  await testEnv.cleanup();
});

describe('Firestore Security Rules', () => {
  describe('Users Collection (IDOR Prevention)', () => {
    it('allows a patient to read and write their own profile', async () => {
      const patientContext = testEnv.authenticatedContext('patient_A');
      const db = patientContext.firestore();

      const docRef = db.collection('users').doc('patient_A');
      await assertSucceeds(docRef.set({ name: 'Alice' }));
      await assertSucceeds(docRef.get());
    });

    it('denies a patient from reading another user profile', async () => {
      const patientContext = testEnv.authenticatedContext('patient_A');
      const db = patientContext.firestore();

      const docRef = db.collection('users').doc('patient_B');
      await assertFails(docRef.get());
    });

    it('denies a patient from writing to another user profile', async () => {
      const patientContext = testEnv.authenticatedContext('patient_A');
      const db = patientContext.firestore();

      const docRef = db.collection('users').doc('patient_B');
      await assertFails(docRef.set({ name: 'Malicious' }));
    });
  });

  describe('Bookings/Appointments Collection', () => {
    it('allows a doctor to read a booking they are assigned to', async () => {
      // Setup the booking document using admin context (bypasses rules)
      await testEnv.withSecurityRulesDisabled(async (context) => {
        const db = context.firestore();
        await db.collection('bookings').doc('booking_1').set({
          doctorId: 'doctor_X',
          patientId: 'patient_A'
        });
      });

      const doctorContext = testEnv.authenticatedContext('doctor_X');
      const db = doctorContext.firestore();

      const docRef = db.collection('bookings').doc('booking_1');
      await assertSucceeds(docRef.get());
    });

    it('denies a doctor from reading a booking they are NOT assigned to', async () => {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        const db = context.firestore();
        await db.collection('bookings').doc('booking_2').set({
          doctorId: 'doctor_Y',
          patientId: 'patient_A'
        });
      });

      const doctorContext = testEnv.authenticatedContext('doctor_X');
      const db = doctorContext.firestore();

      const docRef = db.collection('bookings').doc('booking_2');
      await assertFails(docRef.get());
    });
  });
});

describe('Firebase Storage Security Rules', () => {
  it('allows a user to upload a report to their own directory', async () => {
    const patientContext = testEnv.authenticatedContext('patient_A');
    const storage = patientContext.storage();

    const fileRef = storage.ref('uploads/patient_A/reports/test.pdf');
    await assertSucceeds(fileRef.putString('mock-pdf-data'));
  });

  it('denies a user from uploading a report to another user directory', async () => {
    const patientContext = testEnv.authenticatedContext('patient_A');
    const storage = patientContext.storage();

    const fileRef = storage.ref('uploads/patient_B/reports/test.pdf');
    await assertFails(fileRef.putString('mock-pdf-data'));
  });
  
  it('denies unauthenticated users from reading or writing', async () => {
    const unauthContext = testEnv.unauthenticatedContext();
    const storage = unauthContext.storage();

    const fileRef = storage.ref('uploads/patient_A/reports/test.pdf');
    await assertFails(fileRef.putString('mock-pdf-data'));
  });
});
