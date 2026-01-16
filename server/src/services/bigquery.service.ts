import fs from 'fs';
import fetch from 'node-fetch';
import jwt from 'jsonwebtoken';
import { logger } from '../utils/logger';

export interface PhoneDataRecord {
  phone_number: string | null;
  order_number: string | null;
  fulfillment_statuses: string | null;
  order_fulfillment: string | null;
}

const DEFAULT_PROJECT_ID = 'bici-klaviyo-datasync';
const DEFAULT_DATASET = 'PhoneDataSet';
const DEFAULT_VIEW = 'PhoneDataSet';

interface ServiceAccountCredentials {
  client_email: string;
  private_key: string;
}

interface BigQuerySchemaField {
  name: string;
}

interface BigQueryQueryResponse {
  jobComplete?: boolean;
  rows?: Array<{ f: Array<{ v: string | null }> }>;
  schema?: { fields: BigQuerySchemaField[] };
}

export class BigQueryService {
  private accessToken: string | null = null;
  private accessTokenExpiry: number | null = null;
  private credentials: ServiceAccountCredentials | null = null;
  private initialized = false;

  private get projectId(): string {
    return process.env.BIGQUERY_PROJECT_ID || DEFAULT_PROJECT_ID;
  }

  private get dataset(): string {
    return process.env.BIGQUERY_PHONE_DATASET || DEFAULT_DATASET;
  }

  private get view(): string {
    return process.env.BIGQUERY_PHONE_VIEW || DEFAULT_VIEW;
  }

  private initializeClient(): void {
    if (this.initialized) return;
    this.initialized = true;

    try {
      this.credentials = this.loadCredentials();
      if (!this.credentials) {
        logger.warn('BigQuery credentials missing; phone data lookup disabled');
        return;
      }
      logger.info('BigQuery client initialized', {
        projectId: this.projectId,
        dataset: this.dataset,
        view: this.view
      });
    } catch (error) {
      logger.warn('Failed to initialize BigQuery client', { error });
      this.credentials = null;
    }
  }

  private normalizePhoneNumber(phoneNumber: string): string {
    return phoneNumber.replace(/\D/g, '');
  }

  private loadCredentials(): ServiceAccountCredentials | null {
    const clientEmail = process.env.BIGQUERY_CLIENT_EMAIL;
    const privateKey = process.env.BIGQUERY_PRIVATE_KEY?.replace(/\\n/g, '\n');

    if (clientEmail && privateKey) {
      return { client_email: clientEmail, private_key: privateKey };
    }

    const credentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
    if (!credentialsPath) {
      return null;
    }

    try {
      const fileContents = fs.readFileSync(credentialsPath, 'utf8');
      const parsed = JSON.parse(fileContents) as ServiceAccountCredentials;
      if (!parsed.client_email || !parsed.private_key) {
        logger.warn('Google credentials file missing required fields');
        return null;
      }
      return {
        client_email: parsed.client_email,
        private_key: parsed.private_key
      };
    } catch (error) {
      logger.warn('Failed to read Google credentials file', { error });
      return null;
    }
  }

  private async getAccessToken(): Promise<string | null> {
    if (this.accessToken && this.accessTokenExpiry && Date.now() < this.accessTokenExpiry) {
      return this.accessToken;
    }

    if (!this.credentials) {
      return null;
    }

    const nowSeconds = Math.floor(Date.now() / 1000);
    const token = jwt.sign(
      {
        iss: this.credentials.client_email,
        scope: 'https://www.googleapis.com/auth/bigquery',
        aud: 'https://oauth2.googleapis.com/token',
        iat: nowSeconds,
        exp: nowSeconds + 3600
      },
      this.credentials.private_key,
      { algorithm: 'RS256' }
    );

    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: token
      }).toString()
    });

    if (!response.ok) {
      logger.warn('Failed to obtain BigQuery access token', {
        status: response.status,
        statusText: response.statusText
      });
      return null;
    }

    const data = (await response.json()) as { access_token?: string; expires_in?: number };
    if (!data.access_token) {
      logger.warn('BigQuery access token missing in response');
      return null;
    }

    this.accessToken = data.access_token;
    this.accessTokenExpiry = Date.now() + (data.expires_in ?? 3600) * 1000 - 60000;
    return this.accessToken;
  }

  private mapRowToRecord(response: BigQueryQueryResponse): PhoneDataRecord | null {
    if (!response.rows?.length || !response.schema?.fields?.length) {
      return null;
    }

    const row = response.rows[0];
    const record: Record<string, string | null> = {};

    response.schema.fields.forEach((field, index) => {
      record[field.name] = row.f?.[index]?.v ?? null;
    });

    return {
      phone_number: record.phone_number ?? null,
      order_number: record.order_number ?? null,
      fulfillment_statuses: record.fulfillment_statuses ?? null,
      order_fulfillment: record.order_fulfillment ?? null
    };
  }

  async getPhoneData(phoneNumber: string): Promise<PhoneDataRecord | null> {
    if (!phoneNumber) return null;

    this.initializeClient();

    if (!this.credentials) {
      logger.warn('BigQuery credentials unavailable; skipping phone data lookup');
      return null;
    }

    const normalizedPhone = this.normalizePhoneNumber(phoneNumber);
    const query = `
      SELECT
        phone_number,
        order_number,
        fulfillment_statuses,
        order_fulfillment
      FROM \`${this.projectId}.${this.dataset}.${this.view}\`
      WHERE phone_number IN UNNEST([@rawPhone, @normalizedPhone])
      LIMIT 1
    `;

    try {
      const accessToken = await this.getAccessToken();
      if (!accessToken) {
        return null;
      }

      const response = await fetch(`https://bigquery.googleapis.com/bigquery/v2/projects/${this.projectId}/queries`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          query,
          useLegacySql: false,
          timeoutMs: 10000,
          parameterMode: 'NAMED',
          queryParameters: [
            {
              name: 'rawPhone',
              parameterType: { type: 'STRING' },
              parameterValue: { value: phoneNumber }
            },
            {
              name: 'normalizedPhone',
              parameterType: { type: 'STRING' },
              parameterValue: { value: normalizedPhone }
            }
          ]
        })
      });

      if (!response.ok) {
        logger.warn('BigQuery query failed', {
          status: response.status,
          statusText: response.statusText
        });
        return null;
      }

      const data = (await response.json()) as BigQueryQueryResponse;

      if (data.jobComplete === false) {
        logger.warn('BigQuery query did not complete within timeout');
        return null;
      }

      return this.mapRowToRecord(data);
    } catch (error) {
      logger.warn('BigQuery phone data lookup failed', { error });
      return null;
    }
  }
}

export const bigQueryService = new BigQueryService();
