import axios from 'axios';

export class TetracubedAPIClient {
    constructor(baseURL, username, password) {
        this.baseURL = baseURL;
        this.username = username;
        this.password = password;
        this.accessToken = null;
        this.tokenExpiry = null;
    }

    async authenticate() {
        try {
            const params = new URLSearchParams();
            params.append('username', this.username);
            params.append('password', this.password);

            const response = await axios.post(
                `${this.baseURL}/token`,
                params,
                {
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded'
                    }
                }
            );

            this.accessToken = response.data.access_token;
            // Token expires in 30 minutes, refresh 5 minutes early
            this.tokenExpiry = Date.now() + (25 * 60 * 1000);

            return true;
        } catch (error) {
            console.error('Authentication failed:', error.response?.data || error.message);
            throw new Error('Failed to authenticate with Tetracubed API');
        }
    }

    async ensureAuthenticated() {
        if (!this.accessToken || Date.now() >= this.tokenExpiry) {
            await this.authenticate();
        }
    }

    async startServer() {
        await this.ensureAuthenticated();

        try {
            const response = await axios.post(
                `${this.baseURL}/tetracubed/start`,
                {},
                {
                    headers: {
                        'Authorization': `Bearer ${this.accessToken}`
                    },
                    timeout: 1800000 // 30 minutes — provisioning has been observed to take 15m+
                }
            );

            return response.data;
        } catch (error) {
            console.error('Start server failed:', error.response?.data || error.message);
            const wrapped = new Error(error.response?.data?.detail || 'Failed to start server');
            // Provisioning can outlive the 15-minute request timeout while still
            // succeeding — callers use this flag to fall back to polling.
            wrapped.isTimeout = error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT';
            throw wrapped;
        }
    }

    async stopServer() {
        await this.ensureAuthenticated();

        try {
            const response = await axios.post(
                `${this.baseURL}/tetracubed/stop`,
                {},
                {
                    headers: {
                        'Authorization': `Bearer ${this.accessToken}`
                    },
                    timeout: 1800000 // 30 minutes — deprovisioning can also run long
                }
            );

            return response.data;
        } catch (error) {
            console.error('Stop server failed:', error.response?.data || error.message);
            throw new Error(error.response?.data?.detail || 'Failed to stop server');
        }
    }

    async getResources() {
        await this.ensureAuthenticated();

        try {
            const response = await axios.get(
                `${this.baseURL}/tetracubed/resources`,
                {
                    headers: {
                        'Authorization': `Bearer ${this.accessToken}`
                    }
                }
            );

            return response.data;
        } catch (error) {
            console.error('Get resources failed:', error.response?.data || error.message);
            throw new Error(error.response?.data?.detail || 'Failed to get resources');
        }
    }
}
