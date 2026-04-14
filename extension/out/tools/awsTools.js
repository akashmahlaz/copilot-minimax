"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerAwsTools = registerAwsTools;
const vscode = __importStar(require("vscode"));
const https = __importStar(require("https"));
const crypto = __importStar(require("crypto"));
function getAwsCreds() {
    const config = vscode.workspace.getConfiguration('awsConnector');
    const accessKeyId = config.get('accessKeyId') || '';
    const secretAccessKey = config.get('secretAccessKey') || '';
    const region = config.get('region') || 'us-east-1';
    if (!accessKeyId || !secretAccessKey) {
        throw new Error('Set awsConnector.accessKeyId and awsConnector.secretAccessKey in VS Code settings.');
    }
    return { accessKeyId, secretAccessKey, region };
}
function hmac(key, data) {
    return crypto.createHmac('sha256', key).update(data, 'utf8').digest();
}
function sha256(data) {
    return crypto.createHash('sha256').update(data, 'utf8').digest('hex');
}
function signV4(method, urlStr, body, service, creds, extraHeaders) {
    const parsed = new URL(urlStr);
    const now = new Date();
    const dateStamp = now.toISOString().replace(/[-:]/g, '').slice(0, 8);
    const amzDate = dateStamp + 'T' + now.toISOString().replace(/[-:]/g, '').slice(9, 15) + 'Z';
    const headers = {
        host: parsed.hostname,
        'x-amz-date': amzDate,
        'content-type': 'application/x-amz-json-1.0',
        ...extraHeaders,
    };
    const signedHeaderKeys = Object.keys(headers).sort();
    const signedHeaders = signedHeaderKeys.join(';');
    const canonicalHeaders = signedHeaderKeys.map(k => `${k}:${headers[k]}\n`).join('');
    const payloadHash = sha256(body);
    const canonicalRequest = [
        method,
        parsed.pathname || '/',
        parsed.searchParams.toString(),
        canonicalHeaders,
        signedHeaders,
        payloadHash,
    ].join('\n');
    const credentialScope = `${dateStamp}/${creds.region}/${service}/aws4_request`;
    const stringToSign = `AWS4-HMAC-SHA256\n${amzDate}\n${credentialScope}\n${sha256(canonicalRequest)}`;
    const kDate = hmac(`AWS4${creds.secretAccessKey}`, dateStamp);
    const kRegion = hmac(kDate, creds.region);
    const kService = hmac(kRegion, service);
    const kSigning = hmac(kService, 'aws4_request');
    const signature = hmac(kSigning, stringToSign).toString('hex');
    headers['authorization'] = `AWS4-HMAC-SHA256 Credential=${creds.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
    return headers;
}
function awsRequest(method, urlStr, body, service, creds, extraHeaders) {
    return new Promise((resolve, reject) => {
        const headers = signV4(method, urlStr, body, service, creds, extraHeaders);
        const parsed = new URL(urlStr);
        const req = https.request({
            hostname: parsed.hostname,
            path: parsed.pathname + parsed.search,
            method,
            headers: { ...headers, 'content-length': Buffer.byteLength(body).toString() },
        }, res => {
            let data = '';
            res.on('data', (c) => data += c);
            res.on('end', () => {
                try {
                    // S3 returns XML, others return JSON
                    if (data.startsWith('<?xml') || data.startsWith('<')) {
                        resolve(data);
                    }
                    else {
                        const json = JSON.parse(data);
                        if (json.__type?.includes('Exception') || json.Error) {
                            reject(new Error(json.message || json.Message || JSON.stringify(json)));
                        }
                        else {
                            resolve(json);
                        }
                    }
                }
                catch {
                    resolve(data);
                }
            });
        });
        req.on('error', reject);
        req.write(body);
        req.end();
    });
}
function s3Request(method, path, body, creds, extraHeaders) {
    const url = `https://s3.${creds.region}.amazonaws.com${path}`;
    return new Promise((resolve, reject) => {
        const now = new Date();
        const dateStamp = now.toISOString().replace(/[-:]/g, '').slice(0, 8);
        const amzDate = dateStamp + 'T' + now.toISOString().replace(/[-:]/g, '').slice(9, 15) + 'Z';
        const parsed = new URL(url);
        const payloadHash = sha256(body);
        const headers = {
            host: parsed.hostname,
            'x-amz-content-sha256': payloadHash,
            'x-amz-date': amzDate,
            ...extraHeaders,
        };
        const signedHeaderKeys = Object.keys(headers).sort();
        const signedHeaders = signedHeaderKeys.join(';');
        const canonicalHeaders = signedHeaderKeys.map(k => `${k}:${headers[k]}\n`).join('');
        const qs = [...parsed.searchParams.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
        const canonicalRequest = [method, parsed.pathname || '/', qs, canonicalHeaders, signedHeaders, payloadHash].join('\n');
        const credentialScope = `${dateStamp}/${creds.region}/s3/aws4_request`;
        const stringToSign = `AWS4-HMAC-SHA256\n${amzDate}\n${credentialScope}\n${sha256(canonicalRequest)}`;
        const kDate = hmac(`AWS4${creds.secretAccessKey}`, dateStamp);
        const kRegion = hmac(kDate, creds.region);
        const kService = hmac(kRegion, 's3');
        const kSigning = hmac(kService, 'aws4_request');
        const signature = hmac(kSigning, stringToSign).toString('hex');
        headers['authorization'] = `AWS4-HMAC-SHA256 Credential=${creds.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
        const req = https.request({
            hostname: parsed.hostname,
            path: parsed.pathname + parsed.search,
            method,
            headers: { ...headers, 'content-length': Buffer.byteLength(body).toString() },
        }, res => {
            let data = '';
            res.on('data', (c) => data += c);
            res.on('end', () => resolve(data));
        });
        req.on('error', reject);
        req.write(body);
        req.end();
    });
}
function parseXmlTag(xml, tag) {
    const results = [];
    const regex = new RegExp(`<${tag}>([^<]*)</${tag}>`, 'g');
    let match;
    while ((match = regex.exec(xml)) !== null) {
        results.push(match[1]);
    }
    return results;
}
// ── Tool helpers ─────────────────────────────────────────────
function textResult(text) {
    return new vscode.LanguageModelToolResult([new vscode.LanguageModelTextPart(text)]);
}
function registerAwsTools(context) {
    // ── S3: List Buckets ─────────────────────────────────────
    context.subscriptions.push(vscode.lm.registerTool('aws_s3_list_buckets', {
        async invoke(_options, _token) {
            const creds = getAwsCreds();
            const xml = await s3Request('GET', '/', '', creds);
            const buckets = parseXmlTag(xml, 'Name');
            const dates = parseXmlTag(xml, 'CreationDate');
            if (!buckets.length) {
                return textResult('No S3 buckets found.');
            }
            const lines = buckets.map((b, i) => `- **${b}** (created: ${dates[i] || 'unknown'})`);
            return textResult(`Found ${buckets.length} S3 buckets:\n\n${lines.join('\n')}`);
        }
    }));
    // ── S3: List Objects ─────────────────────────────────────
    context.subscriptions.push(vscode.lm.registerTool('aws_s3_list_objects', {
        async invoke(options, _token) {
            const creds = getAwsCreds();
            const { bucket, prefix, maxKeys } = options.input || {};
            if (!bucket) {
                return textResult('Please provide a bucket name.');
            }
            const params = new URLSearchParams({ 'list-type': '2', 'max-keys': String(maxKeys || 20) });
            if (prefix) {
                params.set('prefix', prefix);
            }
            const xml = await s3Request('GET', `/${bucket}?${params}`, '', creds);
            const keys = parseXmlTag(xml, 'Key');
            const sizes = parseXmlTag(xml, 'Size');
            if (!keys.length) {
                return textResult(`No objects found in s3://${bucket}/${prefix || ''}`);
            }
            const lines = keys.map((k, i) => {
                const size = sizes[i] ? ` (${formatBytes(parseInt(sizes[i]))})` : '';
                return `- \`${k}\`${size}`;
            });
            return textResult(`Objects in **s3://${bucket}/${prefix || ''}**:\n\n${lines.join('\n')}`);
        }
    }));
    // ── S3: Get Object ───────────────────────────────────────
    context.subscriptions.push(vscode.lm.registerTool('aws_s3_get_object', {
        async invoke(options, _token) {
            const creds = getAwsCreds();
            const { bucket, key } = options.input || {};
            if (!bucket || !key) {
                return textResult('Provide bucket and key.');
            }
            const data = await s3Request('GET', `/${bucket}/${encodeURIComponent(key)}`, '', creds);
            const preview = typeof data === 'string' ? data.substring(0, 3000) : JSON.stringify(data).substring(0, 3000);
            return textResult(`**s3://${bucket}/${key}** content:\n\n\`\`\`\n${preview}\n\`\`\``);
        }
    }));
    // ── Lambda: List Functions ────────────────────────────────
    context.subscriptions.push(vscode.lm.registerTool('aws_lambda_list_functions', {
        async invoke(options, _token) {
            const creds = getAwsCreds();
            const max = options.input?.maxItems || 20;
            const url = `https://lambda.${creds.region}.amazonaws.com/2015-03-31/functions?MaxItems=${max}`;
            const data = await awsRequest('GET', url, '', 'lambda', creds);
            const fns = data.Functions || [];
            if (!fns.length) {
                return textResult('No Lambda functions found.');
            }
            const lines = fns.map((f) => `- **${f.FunctionName}** | Runtime: ${f.Runtime || 'N/A'} | Memory: ${f.MemorySize}MB | Timeout: ${f.Timeout}s`);
            return textResult(`Found ${fns.length} Lambda functions:\n\n${lines.join('\n')}`);
        }
    }));
    // ── Lambda: Invoke Function ──────────────────────────────
    context.subscriptions.push(vscode.lm.registerTool('aws_lambda_invoke', {
        async invoke(options, _token) {
            const creds = getAwsCreds();
            const { functionName, payload } = options.input || {};
            if (!functionName) {
                return textResult('Provide functionName.');
            }
            const body = payload || '{}';
            const url = `https://lambda.${creds.region}.amazonaws.com/2015-03-31/functions/${encodeURIComponent(functionName)}/invocations`;
            const data = await awsRequest('POST', url, body, 'lambda', creds);
            const result = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
            return textResult(`**Lambda ${functionName}** invocation result:\n\n\`\`\`json\n${result.substring(0, 3000)}\n\`\`\``);
        }
    }));
    // ── EC2: List Instances ──────────────────────────────────
    context.subscriptions.push(vscode.lm.registerTool('aws_ec2_list_instances', {
        async invoke(_options, _token) {
            const creds = getAwsCreds();
            const url = `https://ec2.${creds.region}.amazonaws.com/?Action=DescribeInstances&Version=2016-11-15`;
            const data = await awsRequest('GET', url, '', 'ec2', creds);
            // EC2 returns XML
            const ids = parseXmlTag(String(data), 'instanceId');
            const states = parseXmlTag(String(data), 'name'); // state names
            const types = parseXmlTag(String(data), 'instanceType');
            if (!ids.length) {
                return textResult('No EC2 instances found.');
            }
            const lines = ids.map((id, i) => `- **${id}** | Type: ${types[i] || '?'} | State: ${states[i] || '?'}`);
            return textResult(`Found ${ids.length} EC2 instances:\n\n${lines.join('\n')}`);
        }
    }));
    // ── EC2: Start/Stop Instance ─────────────────────────────
    context.subscriptions.push(vscode.lm.registerTool('aws_ec2_manage_instance', {
        async invoke(options, _token) {
            const creds = getAwsCreds();
            const { instanceId, action } = options.input || {};
            if (!instanceId || !action) {
                return textResult('Provide instanceId and action (start/stop/reboot).');
            }
            const actionMap = { start: 'StartInstances', stop: 'StopInstances', reboot: 'RebootInstances' };
            const apiAction = actionMap[action];
            if (!apiAction) {
                return textResult('Action must be start, stop, or reboot.');
            }
            const url = `https://ec2.${creds.region}.amazonaws.com/?Action=${apiAction}&InstanceId.1=${instanceId}&Version=2016-11-15`;
            await awsRequest('GET', url, '', 'ec2', creds);
            return textResult(`EC2 instance **${instanceId}** — **${action}** command sent successfully.`);
        }
    }));
    // ── CloudWatch: Get Log Groups ───────────────────────────
    context.subscriptions.push(vscode.lm.registerTool('aws_cloudwatch_log_groups', {
        async invoke(options, _token) {
            const creds = getAwsCreds();
            const body = { limit: options.input?.limit || 20 };
            if (options.input?.prefix) {
                body.logGroupNamePrefix = options.input.prefix;
            }
            const url = `https://logs.${creds.region}.amazonaws.com/`;
            const data = await awsRequest('POST', url, JSON.stringify(body), 'logs', creds, { 'x-amz-target': 'Logs_20140328.DescribeLogGroups' });
            const groups = data.logGroups || [];
            if (!groups.length) {
                return textResult('No CloudWatch log groups found.');
            }
            const lines = groups.map((g) => `- **${g.logGroupName}** | Stored: ${formatBytes(g.storedBytes || 0)} | Retention: ${g.retentionInDays || '∞'} days`);
            return textResult(`Found ${groups.length} log groups:\n\n${lines.join('\n')}`);
        }
    }));
    // ── CloudWatch: Get Recent Logs ──────────────────────────
    context.subscriptions.push(vscode.lm.registerTool('aws_cloudwatch_get_logs', {
        async invoke(options, _token) {
            const creds = getAwsCreds();
            const { logGroupName, logStreamName, limit } = options.input || {};
            if (!logGroupName) {
                return textResult('Provide logGroupName.');
            }
            if (!logStreamName) {
                const body = JSON.stringify({ logGroupName, limit: 1, orderBy: 'LastEventTime', descending: true });
                const url = `https://logs.${creds.region}.amazonaws.com/`;
                const streams = await awsRequest('POST', url, body, 'logs', creds, { 'x-amz-target': 'Logs_20140328.DescribeLogStreams' });
                const stream = streams.logStreams?.[0];
                if (!stream) {
                    return textResult(`No log streams in ${logGroupName}`);
                }
                const evtBody = JSON.stringify({ logGroupName, logStreamName: stream.logStreamName, limit: limit || 30, startFromHead: false });
                const events = await awsRequest('POST', url, evtBody, 'logs', creds, { 'x-amz-target': 'Logs_20140328.GetLogEvents' });
                const lines = (events.events || []).map((e) => `[${new Date(e.timestamp).toISOString()}] ${e.message}`);
                return textResult(`**${logGroupName}** / ${stream.logStreamName} — last ${lines.length} events:\n\n\`\`\`\n${lines.join('\n')}\n\`\`\``);
            }
            const evtBody = JSON.stringify({ logGroupName, logStreamName, limit: limit || 30, startFromHead: false });
            const url = `https://logs.${creds.region}.amazonaws.com/`;
            const events = await awsRequest('POST', url, evtBody, 'logs', creds, { 'x-amz-target': 'Logs_20140328.GetLogEvents' });
            const lines = (events.events || []).map((e) => `[${new Date(e.timestamp).toISOString()}] ${e.message}`);
            return textResult(`**${logGroupName}** / ${logStreamName} — ${lines.length} events:\n\n\`\`\`\n${lines.join('\n')}\n\`\`\``);
        }
    }));
}
function formatBytes(bytes) {
    if (bytes === 0) {
        return '0 B';
    }
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}
//# sourceMappingURL=awsTools.js.map