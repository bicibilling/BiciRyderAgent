import axios from 'axios';

const FRESHDESK_DOMAIN = process.env.FRESHDESK_DOMAIN!;
const FRESHDESK_API_KEY = process.env.FRESHDESK_API_KEY!;

if (!FRESHDESK_DOMAIN || !FRESHDESK_API_KEY) {
  console.warn('Freshdesk env vars not set – Freshdesk integration is disabled');
}

export class FreshdeskService {
  private baseUrl: string;
  private authHeader: { Authorization: string };

  constructor() {
    this.baseUrl = `${FRESHDESK_DOMAIN}/api/v2`;
    const token = Buffer.from(`${FRESHDESK_API_KEY}:X`).toString('base64');
    this.authHeader = { Authorization: `Basic ${token}` };
  }

  async createTicket(params: {
    subject: string;
    description: string;
    email?: string;
    phone?: string;
    priority?: 1 | 2 | 3 | 4;
    status?: 2 | 3 | 4 | 5; // Freshdesk status codes
    tags?: string[];
  }) {
    if (!FRESHDESK_DOMAIN || !FRESHDESK_API_KEY) {
      return null; // fail-soft if not configured
    }

    const body = {
      subject: params.subject,
      description: params.description,
      email: params.email,
      phone: params.phone,
      priority: params.priority ?? 2,
      status: params.status ?? 2,
      tags: params.tags ?? []
    };

    const res = await axios.post(`${this.baseUrl}/tickets`, body, {
      headers: {
        ...this.authHeader,
        'Content-Type': 'application/json'
      }
    });

    return res.data;
  }

  async addNoteToTicket(ticketId: number, note: string, privateNote = true) {
    if (!FRESHDESK_DOMAIN || !FRESHDESK_API_KEY) {
      return null;
    }

    const body = {
      body: note,
      private: privateNote
    };

    const res = await axios.post(
      `${this.baseUrl}/tickets/${ticketId}/notes`,
      body,
      {
        headers: {
          ...this.authHeader,
          'Content-Type': 'application/json'
        }
      }
    );

    return res.data;
  }
}
