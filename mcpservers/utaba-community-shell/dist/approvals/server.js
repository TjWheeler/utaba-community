/**
 * Approval Server - Web UI for Command Approvals
 *
 * FIXED: Now uses ApprovalManager instead of ApprovalQueue directly
 * This ensures bridged async jobs are visible in the approval center
 */
import express from 'express';
import crypto from 'crypto';
import { ApprovalServerError } from './types.js';
export class ApprovalServer {
    approvalManager;
    config;
    logger;
    app;
    server = null;
    authToken;
    isRunning = false;
    port = null;
    connectedClients = new Set(); // Track SSE connections
    constructor(approvalManager, // 🔥 CHANGED: Use manager instead of queue
    config, logger) {
        this.approvalManager = approvalManager;
        this.config = config;
        this.logger = logger;
        this.app = express();
        this.authToken = config.authToken || this.generateAuthToken();
        this.setupMiddleware();
        this.setupRoutes();
        this.setupErrorHandling();
        this.setupManagerEventListeners(); // 🔥 NEW: Listen to manager events
    }
    /**
     * Start the approval server
     */
    async start() {
        if (this.isRunning) {
            throw new ApprovalServerError('Server is already running');
        }
        return new Promise((resolve, reject) => {
            this.server = this.app.listen(this.config.port || 0, 'localhost', () => {
                const address = this.server.address();
                if (!address || typeof address === 'string') {
                    reject(new ApprovalServerError('Failed to get server address'));
                    return;
                }
                this.port = address.port;
                this.isRunning = true;
                const url = `http://localhost:${this.port}?token=${this.authToken}`;
                this.logger.info('ApprovalServer', 'Server started successfully', 'start', {
                    port: this.port,
                    url: url.replace(this.authToken, '***'),
                    authToken: this.authToken.substring(0, 8) + '***'
                });
                // Auto-launch browser if configured
                if (this.config.autoLaunch) {
                    this.launchBrowser(url).catch(error => {
                        this.logger.warn('ApprovalServer', 'Failed to auto-launch browser', 'start', {
                            error: error.message
                        });
                    });
                }
                resolve({
                    port: this.port,
                    url,
                    authToken: this.authToken
                });
            });
            this.server.on('error', (error) => {
                this.logger.error('ApprovalServer', 'Server error', 'start', {
                    error: error.message,
                    code: error.code
                });
                reject(new ApprovalServerError(`Server failed to start: ${error.message}`));
            });
        });
    }
    /**
     * Stop the approval server
     */
    async stop() {
        if (!this.isRunning || !this.server) {
            return;
        }
        // Close all SSE connections
        for (const client of this.connectedClients) {
            try {
                client.end();
            }
            catch (error) {
                // Ignore errors when closing connections
            }
        }
        this.connectedClients.clear();
        return new Promise((resolve) => {
            this.server.close(() => {
                this.isRunning = false;
                this.port = null;
                this.server = null;
                this.logger.info('ApprovalServer', 'Server stopped', 'stop');
                resolve();
            });
        });
    }
    /**
     * Get server status
     */
    getStatus() {
        const url = this.port ? `http://localhost:${this.port}?token=${this.authToken}` : null;
        return {
            isRunning: this.isRunning,
            port: this.port,
            url,
            authToken: this.authToken
        };
    }
    // Private methods
    /**
     * 🔥 NEW: Set up event listeners for manager events to push real-time updates
     */
    setupManagerEventListeners() {
        this.approvalManager.on('requestCreated', (data) => {
            this.logger.debug('ApprovalServer', 'Received requestCreated event', 'managerEvent', {
                requestId: data.requestId,
                command: data.command
            });
            this.broadcastToClients({
                type: 'requestCreated',
                data,
                timestamp: Date.now()
            });
        });
        // 🔥 KEY FIX: Listen for requestDecided events and immediately notify all clients
        this.approvalManager.on('requestDecided', (data) => {
            this.logger.debug('ApprovalServer', 'Received requestDecided event - broadcasting to clients', 'managerEvent', {
                requestId: data.requestId,
                decision: data.decision,
                decidedBy: data.decidedBy,
                connectedClients: this.connectedClients.size
            });
            this.broadcastToClients({
                type: 'requestDecided',
                data,
                timestamp: Date.now()
            });
        });
    }
    /**
     * 🔥 NEW: Broadcast events to all connected SSE clients
     * 🔥 FIXED: Use actual newlines instead of escaped backslashes
     */
    broadcastToClients(event) {
        const eventData = JSON.stringify(event);
        for (const client of this.connectedClients) {
            try {
                client.write(`data: ${eventData}\n\n`); // 🔥 FIXED: Real newlines
            }
            catch (error) {
                // Remove dead connections
                this.connectedClients.delete(client);
                this.logger.debug('ApprovalServer', 'Removed dead SSE connection', 'broadcast');
            }
        }
        this.logger.debug('ApprovalServer', 'Broadcast event to clients', 'broadcast', {
            eventType: event.type,
            clientCount: this.connectedClients.size,
            eventData: eventData.substring(0, 100) + '...'
        });
    }
    setupMiddleware() {
        // Parse JSON bodies
        this.app.use(express.json());
        // Parse URL-encoded bodies
        this.app.use(express.urlencoded({ extended: true }));
        // Security headers
        this.app.use((req, res, next) => {
            res.setHeader('X-Content-Type-Options', 'nosniff');
            res.setHeader('X-Frame-Options', 'DENY');
            res.setHeader('X-XSS-Protection', '1; mode=block');
            res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
            res.setHeader('Content-Security-Policy', "default-src 'self' 'unsafe-inline'; connect-src 'self'");
            next();
        });
        // Mandatory token authentication middleware
        this.app.use((req, res, next) => {
            // Skip auth for health check
            if (req.path === '/health') {
                return next();
            }
            const token = req.query.token || req.headers['authorization']?.replace('Bearer ', '');
            if (!token || token !== this.authToken) {
                this.logger.warn('ApprovalServer', 'Unauthorized access attempt', 'auth', {
                    ip: req.ip,
                    path: req.path,
                    userAgent: req.get('User-Agent')
                });
                return res.status(401).json({
                    error: 'Unauthorized',
                    message: 'Valid authentication token required'
                });
            }
            next();
        });
        // Logging middleware
        this.app.use((req, res, next) => {
            this.logger.debug('ApprovalServer', 'Request received', 'middleware', {
                method: req.method,
                path: req.path,
                ip: req.ip
            });
            next();
        });
    }
    setupRoutes() {
        // Health check (no auth required)
        this.app.get('/health', (req, res) => {
            res.json({ status: 'ok', timestamp: Date.now() });
        });
        // Serve static files (approval UI)
        this.app.get('/', async (req, res) => {
            try {
                const htmlContent = await this.generateApprovalUI();
                res.setHeader('Content-Type', 'text/html');
                res.send(htmlContent);
            }
            catch (error) {
                this.logger.error('ApprovalServer', 'Failed to serve UI', 'route', {
                    error: error instanceof Error ? error.message : 'Unknown error'
                });
                res.status(500).json({ error: 'Failed to load approval interface' });
            }
        });
        // API Routes
        // Get pending requests - 🔥 FIXED: Now calls manager instead of queue
        this.app.get('/api/requests/pending', async (req, res) => {
            try {
                const requests = await this.approvalManager.getPendingRequests(); // 🔥 FIXED!
                res.json({ requests });
            }
            catch (error) {
                this.logger.error('ApprovalServer', 'Failed to get pending requests', 'api', {
                    error: error instanceof Error ? error.message : 'Unknown error'
                });
                res.status(500).json({ error: 'Failed to get pending requests' });
            }
        });
        // Get queue statistics - 🔥 FIXED: Now calls manager instead of queue
        this.app.get('/api/stats', async (req, res) => {
            try {
                const stats = await this.approvalManager.getStats(); // 🔥 FIXED!
                res.json({ stats });
            }
            catch (error) {
                this.logger.error('ApprovalServer', 'Failed to get stats', 'api', {
                    error: error instanceof Error ? error.message : 'Unknown error'
                });
                res.status(500).json({ error: 'Failed to get statistics' });
            }
        });
        // Approve a request - 🔥 FIXED: Now calls manager instead of queue
        this.app.post('/api/requests/:id/approve', async (req, res) => {
            try {
                const { id } = req.params;
                const { decidedBy = 'browser-user' } = req.body;
                await this.approvalManager.approveRequest(id, decidedBy); // 🔥 FIXED!
                this.logger.info('ApprovalServer', 'Request approved via browser', 'api', {
                    requestId: id,
                    decidedBy
                });
                res.json({ success: true, message: 'Request approved' });
            }
            catch (error) {
                this.logger.error('ApprovalServer', 'Failed to approve request', 'api', {
                    requestId: req.params.id,
                    error: error instanceof Error ? error.message : 'Unknown error'
                });
                res.status(500).json({ error: 'Failed to approve request' });
            }
        });
        // Reject a request - 🔥 FIXED: Now calls manager instead of queue
        this.app.post('/api/requests/:id/reject', async (req, res) => {
            try {
                const { id } = req.params;
                const { decidedBy = 'browser-user', reason } = req.body;
                await this.approvalManager.rejectRequest(id, decidedBy); // 🔥 FIXED!
                this.logger.info('ApprovalServer', 'Request rejected via browser', 'api', {
                    requestId: id,
                    decidedBy,
                    reason
                });
                res.json({ success: true, message: 'Request rejected' });
            }
            catch (error) {
                this.logger.error('ApprovalServer', 'Failed to reject request', 'api', {
                    requestId: req.params.id,
                    error: error instanceof Error ? error.message : 'Unknown error'
                });
                res.status(500).json({ error: 'Failed to reject request' });
            }
        });
        // Get specific request details
        this.app.get('/api/requests/:id', async (req, res) => {
            try {
                const { id } = req.params;
                const allRequests = await this.approvalManager.getPendingRequests();
                const request = allRequests.find(r => r.id === id);
                if (!request) {
                    return res.status(404).json({ error: 'Request not found' });
                }
                return res.json({ request });
            }
            catch (error) {
                this.logger.error('ApprovalServer', 'Failed to get request', 'api', {
                    requestId: req.params.id,
                    error: error instanceof Error ? error.message : 'Unknown error'
                });
                return res.status(500).json({ error: 'Failed to get request' });
            }
        });
        // Server-Sent Events for real-time updates using manager events
        // 🔥 FIXED: All SSE writes now use actual newlines instead of escaped backslashes
        this.app.get('/api/events', (req, res) => {
            res.setHeader('Content-Type', 'text/event-stream');
            res.setHeader('Cache-Control', 'no-cache');
            res.setHeader('Connection', 'keep-alive');
            res.setHeader('Access-Control-Allow-Origin', '*');
            // Add this client to our tracked connections
            this.connectedClients.add(res);
            this.logger.debug('ApprovalServer', 'New SSE client connected', 'sse', {
                totalClients: this.connectedClients.size
            });
            // Send initial connection event - 🔥 FIXED: Real newlines
            res.write('data: ' + JSON.stringify({
                type: 'connected',
                timestamp: Date.now(),
                message: 'Real-time updates active'
            }) + '\n\n');
            // Send current state - 🔥 FIXED: Real newlines
            this.approvalManager.getPendingRequests().then(requests => {
                res.write('data: ' + JSON.stringify({
                    type: 'initialData',
                    requests,
                    timestamp: Date.now()
                }) + '\n\n');
            }).catch(error => {
                this.logger.error('ApprovalServer', 'Failed to send initial SSE data', 'sse', {
                    error: error.message
                });
            });
            // Clean up on client disconnect
            req.on('close', () => {
                this.connectedClients.delete(res);
                this.logger.debug('ApprovalServer', 'SSE client disconnected', 'sse', {
                    totalClients: this.connectedClients.size
                });
            });
            req.on('error', () => {
                this.connectedClients.delete(res);
            });
            // Keep connection alive with periodic pings - 🔥 FIXED: Real newlines
            const keepAlive = setInterval(() => {
                if (this.connectedClients.has(res)) {
                    try {
                        res.write('data: ' + JSON.stringify({
                            type: 'ping',
                            timestamp: Date.now()
                        }) + '\n\n');
                    }
                    catch (error) {
                        this.connectedClients.delete(res);
                        clearInterval(keepAlive);
                    }
                }
                else {
                    clearInterval(keepAlive);
                }
            }, 30000); // Ping every 30 seconds
            req.on('close', () => {
                clearInterval(keepAlive);
            });
        });
    }
    setupErrorHandling() {
        // Global error handler
        this.app.use((err, req, res, next) => {
            this.logger.error('ApprovalServer', 'Unhandled server error', 'errorHandler', {
                error: err.message,
                stack: err.stack,
                path: req.path,
                method: req.method
            });
            res.status(500).json({
                error: 'Internal server error',
                message: 'An unexpected error occurred'
            });
        });
    }
    async generateApprovalUI() {
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Utaba MCP Shell - Command Approvals</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: #f5f5f5;
            color: #333;
            line-height: 1.6;
        }
        
        .container {
            max-width: 1200px;
            margin: 0 auto;
            padding: 20px;
        }
        
        .header {
            background: white;
            border-radius: 8px;
            padding: 20px;
            margin-bottom: 20px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        
        .header h1 {
            color: #2c3e50;
            margin-bottom: 10px;
        }
        
        .stats {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 15px;
            margin-bottom: 20px;
        }
        
        .stat-card {
            background: white;
            border-radius: 8px;
            padding: 20px;
            text-align: center;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        
        .stat-number {
            font-size: 2em;
            font-weight: bold;
            color: #3498db;
        }
        
        .stat-label {
            color: #666;
            margin-top: 5px;
        }
        
        .requests-container {
            background: white;
            border-radius: 8px;
            padding: 20px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            margin-bottom: 20px;
        }
        
        .footer {
            background: white;
            border-radius: 8px;
            padding: 20px;
            text-align: center;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            border-top: 3px solid #3498db;
        }
        
        .footer p {
            color: #666;
            margin: 0;
            font-size: 14px;
        }
        
        .footer a {
            color: #3498db;
            text-decoration: none;
            font-weight: 500;
        }
        
        .footer a:hover {
            text-decoration: underline;
        }
        
        .footer-links {
            margin-top: 8px;
        }
        
        .footer-links a {
            margin: 0 10px;
        }
        
        .request-card {
            border: 1px solid #e0e0e0;
            border-radius: 8px;
            padding: 20px;
            margin-bottom: 15px;
            transition: all 0.3s ease;
        }
        
        .request-card:hover {
            border-color: #3498db;
        }
        
        .request-card.removing {
            opacity: 0;
            transform: scale(0.95);
            margin-bottom: 0;
            padding: 0;
            height: 0;
            overflow: hidden;
        }
        
        .request-header {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            margin-bottom: 15px;
        }
        
        .request-command {
            font-family: 'Monaco', 'Menlo', monospace;
            background: #f8f9fa;
            padding: 10px;
            border-radius: 4px;
            font-size: 14px;
            margin: 10px 0;
        }
        
        .risk-score {
            padding: 4px 12px;
            border-radius: 20px;
            font-size: 12px;
            font-weight: bold;
        }
        
        .risk-low { background: #d4edda; color: #155724; }
        .risk-medium { background: #fff3cd; color: #856404; }
        .risk-high { background: #f8d7da; color: #721c24; }
        
        .request-details {
            margin: 15px 0;
        }
        
        .detail-row {
            display: flex;
            justify-content: space-between;
            margin: 8px 0;
            padding: 8px 0;
            border-bottom: 1px solid #f0f0f0;
        }
        
        .detail-label {
            font-weight: 600;
            color: #666;
        }
        
        .detail-value {
            color: #333;
            font-family: monospace;
        }
        
        .risk-factors {
            margin: 15px 0;
        }
        
        .risk-factors ul {
            list-style: none;
            margin: 10px 0;
        }
        
        .risk-factors li {
            background: #fff3cd;
            padding: 8px 12px;
            margin: 5px 0;
            border-radius: 4px;
            border-left: 4px solid #ffc107;
        }
        
        .actions {
            display: flex;
            gap: 10px;
            margin-top: 20px;
        }
        
        .btn {
            padding: 12px 24px;
            border: none;
            border-radius: 6px;
            font-size: 16px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.2s;
            min-width: 120px;
        }
        
        .btn-approve {
            background: #28a745;
            color: white;
        }
        
        .btn-approve:hover {
            background: #218838;
        }
        
        .btn-reject {
            background: #dc3545;
            color: white;
        }
        
        .btn-reject:hover {
            background: #c82333;
        }
        
        .btn:disabled {
            opacity: 0.6;
            cursor: not-allowed;
        }
        
        .empty-state {
            text-align: center;
            padding: 60px 20px;
            color: #666;
        }
        
        .empty-state h3 {
            margin-bottom: 10px;
            color: #999;
        }
        
        .status-indicator {
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 10px 20px;
            border-radius: 6px;
            font-weight: 600;
            z-index: 1000;
            transition: opacity 0.3s;
        }
        
        .status-connected {
            background: #d4edda;
            color: #155724;
        }
        
        .status-disconnected {
            background: #f8d7da;
            color: #721c24;
        }
        
        .status-polling {
            background: #fff3cd;
            color: #856404;
        }
        
        .loading {
            display: inline-block;
            width: 20px;
            height: 20px;
            border: 3px solid #f3f3f3;
            border-top: 3px solid #3498db;
            border-radius: 50%;
            animation: spin 1s linear infinite;
        }
        
        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
        
        @media (max-width: 768px) {
            .container {
                padding: 10px;
            }
            
            .request-header {
                flex-direction: column;
                align-items: flex-start;
            }
            
            .actions {
                flex-direction: column;
            }
            
            .btn {
                width: 100%;
            }
            
            .footer-links a {
                display: block;
                margin: 5px 0;
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🛡️ Command Approval Center</h1>
            <p>Review and approve command executions for enhanced security.</p>
        </div>
        
        <div class="stats" id="stats">
            <div class="stat-card">
                <div class="stat-number" id="stat-pending">-</div>
                <div class="stat-label">Pending</div>
            </div>
            <div class="stat-card">
                <div class="stat-number" id="stat-approved">-</div>
                <div class="stat-label">Approved</div>
            </div>
            <div class="stat-card">
                <div class="stat-number" id="stat-rejected">-</div>
                <div class="stat-label">Rejected</div>
            </div>
            <div class="stat-card">
                <div class="stat-number" id="stat-total">-</div>
                <div class="stat-label">Total</div>
            </div>
        </div>
        
        <div class="requests-container">
            <h2>Pending Approvals</h2>
            <div id="requests-list">
                <div class="loading"></div>
            </div>
        </div>
        
        <div class="footer">
            <p>Proudly open sourced for the community by <a href="https://utaba.ai" target="_blank">Utaba AI</a></p>
            <div class="footer-links">
                <a href="https://github.com/TjWheeler/utaba-community" target="_blank">Utaba Community Github</a>
            </div>
        </div>
    </div>
    
    <div class="status-indicator" id="status-indicator">
        <span class="loading"></span> Connecting...
    </div>

    <script>
        class ApprovalUI {
            constructor() {
                this.eventSource = null;
                this.isSSEConnected = false;
                this.lastDataHash = null;
                this.pollCount = 0;
                this.init();
            }
            
            async init() {
                await this.loadStats();
                await this.loadPendingRequests();
                this.setupEventStream();
                this.setupKeyboardShortcuts();
            }
            
            async loadStats() {
                try {
                    const response = await fetch('/api/stats?' + this.getAuthParam());
                    const data = await response.json();
                    
                    if (data.stats) {
                        document.getElementById('stat-pending').textContent = data.stats.pending;
                        document.getElementById('stat-approved').textContent = data.stats.approved;
                        document.getElementById('stat-rejected').textContent = data.stats.rejected;
                        document.getElementById('stat-total').textContent = data.stats.total;
                    }
                } catch (error) {
                    console.error('Failed to load stats:', error);
                }
            }
            
            async loadPendingRequests() {
                try {
                    const response = await fetch('/api/requests/pending?' + this.getAuthParam());
                    const data = await response.json();
                    
                    this.renderRequests(data.requests || []);
                    this.lastDataHash = JSON.stringify(data.requests || []); // Track initial hash
                } catch (error) {
                    console.error('Failed to load pending requests:', error);
                    this.renderError('Failed to load pending requests');
                }
            }
            
            renderRequests(requests) {
                const container = document.getElementById('requests-list');
                
                if (requests.length === 0) {
                    container.innerHTML = \`
                        <div class="empty-state">
                            <h3>No pending approvals</h3>
                            <p>All command executions are up to date!</p>
                        </div>
                    \`;
                    return;
                }
                
                container.innerHTML = requests.map(request => this.renderRequest(request)).join('');
            }
            
            renderRequest(request) {
                const riskClass = request.riskScore <= 3 ? 'risk-low' : 
                                request.riskScore <= 6 ? 'risk-medium' : 'risk-high';
                
                const commandText = \`\${request.command} \${request.args.join(' ')}\`.trim();
                const timeAgo = this.formatTimeAgo(request.createdAt);
                
                return \`
                    <div class="request-card" data-request-id="\${request.id}">
                        <div class="request-header">
                            <div>
                                <h3>Command Execution Request</h3>
                                <small>Requested \${timeAgo}</small>
                            </div>
                            <div class="risk-score \${riskClass}">
                                Risk: \${request.riskScore}/10
                            </div>
                        </div>
                        
                        <div class="request-command">\${this.escapeHtml(commandText)}</div>
                        
                        <div class="request-details">
                            <div class="detail-row">
                                <span class="detail-label">Working Directory:</span>
                                <span class="detail-value">\${this.escapeHtml(request.workingDirectory)}</span>
                            </div>
                            \${request.packageName ? \`
                                <div class="detail-row">
                                    <span class="detail-label">Package:</span>
                                    <span class="detail-value">\${this.escapeHtml(request.packageName)}</span>
                                </div>
                            \` : ''}
                            <div class="detail-row">
                                <span class="detail-label">Timeout:</span>
                                <span class="detail-value">\${(request.timeout / 1000).toFixed(0)}s</span>
                            </div>
                        </div>
                        
                        \${request.riskFactors.length > 0 ? \`
                            <div class="risk-factors">
                                <strong>Risk Factors:</strong>
                                <ul>
                                    \${request.riskFactors.map(factor => \`<li>\${this.escapeHtml(factor)}</li>\`).join('')}
                                </ul>
                            </div>
                        \` : ''}
                        
                        <div class="actions">
                            <button class="btn btn-approve" onclick="approvalUI.approve('\${request.id}')">
                                ✅ Approve
                            </button>
                            <button class="btn btn-reject" onclick="approvalUI.reject('\${request.id}')">
                                ❌ Reject
                            </button>
                        </div>
                    </div>
                \`;
            }
            
            async approve(requestId) {
                await this.processDecision(requestId, 'approve');
            }
            
            async reject(requestId) {
                await this.processDecision(requestId, 'reject');
            }
            
            async processDecision(requestId, action) {
                const card = document.querySelector(\`[data-request-id="\${requestId}"]\`);
                if (!card) return;
                
                const buttons = card.querySelectorAll('.btn');
                buttons.forEach(btn => btn.disabled = true);
                
                try {
                    const response = await fetch(\`/api/requests/\${requestId}/\${action}?\` + this.getAuthParam(), {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({
                            decidedBy: 'browser-user'
                        })
                    });
                    
                    if (response.ok) {
                        console.log(\`\${action} successful for request \${requestId} - removing card immediately\`);
                        this.removeRequestCard(requestId);
                        await this.loadStats();
                    } else {
                        throw new Error('Failed to process decision');
                    }
                } catch (error) {
                    console.error(\`Failed to \${action} request:\`, error);
                    buttons.forEach(btn => btn.disabled = false);
                    alert(\`Failed to \${action} request. Please try again.\`);
                }
            }
            
            removeRequestCard(requestId) {
                const card = document.querySelector(\`[data-request-id="\${requestId}"]\`);
                if (!card) return;
                
                card.classList.add('removing');
                
                setTimeout(() => {
                    card.remove();
                    this.checkEmpty();
                }, 300);
            }
            
            setupEventStream() {
                try {
                    this.eventSource = new EventSource('/api/events?' + this.getAuthParam());
                    
                    this.eventSource.onopen = () => {
                        this.isSSEConnected = true;
                        this.updateStatus('connected', '🟢 Connected');
                        console.log('SSE connection established');
                    };
                    
                    this.eventSource.onerror = () => {
                        this.isSSEConnected = false;
                        this.updateStatus('disconnected', '🔴 Disconnected');
                        console.log('SSE connection error');
                    };
                    
                    this.eventSource.onmessage = (event) => {
                        try {
                            const data = JSON.parse(event.data);
                            this.handleEvent(data);
                        } catch (error) {
                            console.error('Failed to parse event data:', error);
                        }
                    };
                } catch (error) {
                    console.error('Failed to setup SSE:', error);
                    this.isSSEConnected = false;
                }
            }
            
            handleEvent(data) {
                console.log('🔥 Received SSE event:', data.type, data);
                
                switch (data.type) {
                    case 'connected':
                        this.isSSEConnected = true;
                        console.log('Real-time connection established');
                        break;
                        
                    case 'initialData':
                        console.log('Received initial data:', data.requests?.length || 0, 'requests');
                        this.renderRequests(data.requests || []);
                        this.lastDataHash = JSON.stringify(data.requests || []);
                        break;
                        
                    case 'requestCreated':
                        console.log('🟢 New request created:', data.data.requestId);
                        this.loadPendingRequests();
                        this.loadStats();
                        break;
                        
                    case 'requestDecided':
                        console.log('🟡 Request decided:', data.data.requestId, '->', data.data.decision);
                        this.removeRequestCard(data.data.requestId);
                        this.loadStats();
                        break;
                        
                    case 'ping':
                        // Keep connection alive
                        break;
                        
                    default:
                        console.log('❓ Unknown event type:', data.type);
                }
            }
            
            setupKeyboardShortcuts() {
                document.addEventListener('keydown', (event) => {
                    if (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA') {
                        return;
                    }
                    
                    const cards = document.querySelectorAll('.request-card');
                    if (cards.length === 0) return;
                    
                    const firstCard = cards[0];
                    const requestId = firstCard.dataset.requestId;
                    
                    if (event.key === 'a' || event.key === 'A') {
                        event.preventDefault();
                        this.approve(requestId);
                    } else if (event.key === 'r' || event.key === 'R') {
                        event.preventDefault();
                        this.reject(requestId);
                    }
                });
            }
            
            updateStatus(status, text) {
                const indicator = document.getElementById('status-indicator');
                indicator.className = \`status-indicator status-\${status}\`;
                indicator.textContent = text;
                
                indicator.style.opacity = '1';
            }
            
            checkEmpty() {
                const container = document.getElementById('requests-list');
                const cards = container.querySelectorAll('.request-card:not(.removing)');
                
                if (cards.length === 0) {
                    container.innerHTML = \`
                        <div class="empty-state">
                            <h3>No pending approvals</h3>
                            <p>All command executions are up to date!</p>
                        </div>
                    \`;
                }
            }
            
            getAuthParam() {
                const urlParams = new URLSearchParams(window.location.search);
                const token = urlParams.get('token');
                return \`token=\${token}\`;
            }
            
            formatTimeAgo(timestamp) {
                const now = Date.now();
                const diff = now - timestamp;
                const seconds = Math.floor(diff / 1000);
                const minutes = Math.floor(seconds / 60);
                const hours = Math.floor(minutes / 60);
                
                if (hours > 0) return \`\${hours}h ago\`;
                if (minutes > 0) return \`\${minutes}m ago\`;
                return \`\${seconds}s ago\`;
            }
            
            escapeHtml(text) {
                const div = document.createElement('div');
                div.textContent = text;
                return div.innerHTML;
            }
            
            renderError(message) {
                const container = document.getElementById('requests-list');
                container.innerHTML = \`
                    <div class="empty-state">
                        <h3>Error</h3>
                        <p>\${this.escapeHtml(message)}</p>
                        <button class="btn" onclick="approvalUI.loadPendingRequests()">Retry</button>
                    </div>
                \`;
            }
        }
        
        const approvalUI = new ApprovalUI();
    </script>
</body>
</html>`;
    }
    generateAuthToken() {
        return crypto.randomBytes(32).toString('hex');
    }
    async launchBrowser(url) {
        try {
            const { spawn } = await import('child_process');
            let command;
            let args;
            if (process.platform === 'win32') {
                command = 'cmd';
                args = ['/c', 'start', url];
            }
            else if (process.platform === 'darwin') {
                command = 'open';
                args = [url];
            }
            else {
                command = 'xdg-open';
                args = [url];
            }
            const child = spawn(command, args, {
                detached: true,
                stdio: 'ignore'
            });
            child.unref();
            this.logger.info('ApprovalServer', 'Browser launched', 'launchBrowser', { url });
        }
        catch (error) {
            this.logger.warn('ApprovalServer', 'Failed to launch browser', 'launchBrowser', {
                error: error instanceof Error ? error.message : 'Unknown error',
                url
            });
        }
    }
}
//# sourceMappingURL=server.js.map