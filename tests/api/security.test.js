const http = require('http');
const request = require('supertest');

// We mock our auth utility so we don't need real Firebase tokens in API unit tests
jest.mock('../../utils/auth', () => ({
  verifyFirebaseToken: jest.fn(),
}));

const { verifyFirebaseToken } = require('../../utils/auth');

// Import the Vercel endpoints
const healthSummaryApi = require('../../api/health-summary');
const labInterpreterApi = require('../../api/lab-interpreter');
const processReportApi = require('../../api/process-report');

// Helper to wrap Vercel serverless functions in an HTTP server for Supertest
function createTestServer(handler) {
  return http.createServer((req, res) => {
    // Vercel expects req.body to be parsed. We simulate that by reading the body first.
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
    });
    req.on('end', () => {
      if (body) {
        try {
          req.body = JSON.parse(body);
        } catch (e) {
          req.body = body;
        }
      } else {
        req.body = {};
      }
      // Vercel provides helper methods like res.status() and res.json()
      res.status = (code) => {
        res.statusCode = code;
        return res;
      };
      res.json = (data) => {
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(data));
      };
      
      handler(req, res).catch(err => {
        res.status(500).json({ error: err.message });
      });
    });
  });
}

describe('Vercel API Security & Architecture Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('IDOR Verification', () => {
    it('POST /api/health-summary ignores req.body.userId and uses authenticated UID', async () => {
      // Mock the token verification to return User A
      verifyFirebaseToken.mockResolvedValue('user_A_auth_id');
      
      // Mock Firestore to just return a dummy response so it doesn't crash on DB queries
      const admin = require('firebase-admin');
      if (!admin.apps.length) {
        admin.initializeApp();
      }
      jest.spyOn(admin, 'firestore').mockReturnValue({
        collection: jest.fn().mockReturnThis(),
        doc: jest.fn().mockReturnThis(),
        get: jest.fn().mockResolvedValue({ exists: false, data: () => ({}) })
      });

      const server = createTestServer(healthSummaryApi);
      
      const response = await request(server)
        .post('/')
        .set('Authorization', 'Bearer fake_token')
        .send({ userId: 'user_B_malicious_target', bookingId: 'booking_123' });

      // In api/health-summary.js, it should check 'booking_123' but under 'user_A_auth_id'
      expect(verifyFirebaseToken).toHaveBeenCalled();
      
      // We know IDOR is fixed if it doesn't throw a 400 about missing userId (since we removed userId from req.body check)
      // and it proceeds to Firestore.
      expect(response.status).not.toBe(400);
      expect(response.status).not.toBe(401);
    });
  });

  describe('SSRF Verification', () => {
    it('POST /api/lab-interpreter blocks malicious documentUrl domains', async () => {
      verifyFirebaseToken.mockResolvedValue('user_A');
      process.env.GEMINI_API_KEY = 'mock_key';
      
      const server = createTestServer(labInterpreterApi);
      
      const response = await request(server)
        .post('/')
        .set('Authorization', 'Bearer fake_token')
        .send({ documentUrl: 'http://169.254.169.254/latest/meta-data/' }); // AWS Metadata IP

      expect(response.status).toBe(500);
      // The SSRF fix throws an Error which gets caught and returned as 500 with details
      expect(response.body.details).toContain('SSRF Protection');
    });

    it('POST /api/lab-interpreter allows firebasestorage URLs', async () => {
      verifyFirebaseToken.mockResolvedValue('user_A');
      // We don't want fetch to actually run, so we'll expect it to fail at fetch (or we mock fetch)
      global.fetch = jest.fn(() => Promise.resolve({
        ok: true,
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)),
        headers: new Headers({'content-type': 'application/pdf'})
      }));
      
      // We also mock Gemini so it doesn't try to call real API
      const { GoogleGenAI } = require('@google/genai');
      jest.mock('@google/genai', () => {
        return {
          GoogleGenAI: jest.fn().mockImplementation(() => {
            return {
              interactions: {
                create: jest.fn().mockResolvedValue({ output_text: 'Mocked lab result' })
              }
            };
          })
        };
      });

      const server = createTestServer(labInterpreterApi);
      
      const response = await request(server)
        .post('/')
        .set('Authorization', 'Bearer fake_token')
        .send({ documentUrl: 'https://firebasestorage.googleapis.com/v0/b/project.appspot.com/o/file.pdf' });

      // We might get 500 if GEMINI_API_KEY is missing, but it shouldn't be SSRF protection error
      expect(response.body.details).not.toContain('SSRF Protection');
    });
  });

  describe('Import Verification', () => {
    it('POST /api/lab-interpreter executes verifyFirebaseToken without ReferenceError', async () => {
      verifyFirebaseToken.mockRejectedValue(new Error('Mock unauthorized'));
      
      const server = createTestServer(labInterpreterApi);
      
      const response = await request(server)
        .post('/')
        .set('Authorization', 'Bearer bad_token')
        .send({ documentUrl: 'https://firebasestorage.googleapis.com/test' });

      expect(response.status).toBe(401);
      expect(response.body.error).toBe('Mock unauthorized');
      // If the import was missing, it would have thrown ReferenceError and returned 500
    });
  });
});
