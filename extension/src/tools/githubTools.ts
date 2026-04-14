import * as vscode from 'vscode';
import { ghRequest } from '../github/githubClient';
import { memorySnapshot } from '../memory/memoryStore';
import { logToolCall } from '../session/sessionStore';

// ── Helpers ─────────────────────────────────────────────────

function textResult(text: string): vscode.LanguageModelToolResult {
    const snap = memorySnapshot();
    return new vscode.LanguageModelToolResult([new vscode.LanguageModelTextPart(snap + text)]);
}

function logged<T>(toolName: string, fn: (options: vscode.LanguageModelToolInvocationOptions<T>, token: vscode.CancellationToken) => Promise<vscode.LanguageModelToolResult>) {
    return async (options: vscode.LanguageModelToolInvocationOptions<T>, token: vscode.CancellationToken): Promise<vscode.LanguageModelToolResult> => {
        const result = await fn(options, token);
        const text = (result.content[0] as any)?.value || '';
        logToolCall(toolName, options.input as any, text);
        return result;
    };
}

// ── Tool Registration ───────────────────────────────────────

export function registerGithubTools(context: vscode.ExtensionContext): void {

    // ── github_list_repos ───────────────────────────────────

    context.subscriptions.push(
        vscode.lm.registerTool('github_list_repos', {
            invoke: logged<{
                type?: 'owner' | 'all' | 'member';
                sort?: 'updated' | 'created' | 'pushed' | 'full_name';
                perPage?: number;
            }>('github_list_repos', async (options, _token) => {
                try {
                    const type = options.input?.type || 'owner';
                    const sort = options.input?.sort || 'updated';
                    const perPage = Math.min(options.input?.perPage || 20, 100);
                    const repos = await ghRequest('GET', `/user/repos?type=${type}&sort=${sort}&per_page=${perPage}`);
                    if (!Array.isArray(repos) || repos.length === 0) {
                        return textResult('No repositories found.');
                    }
                    const lines = repos.map((r: any) => {
                        const vis = r.private ? '🔒' : '🌐';
                        const lang = r.language || 'N/A';
                        const stars = r.stargazers_count || 0;
                        const updated = r.updated_at?.slice(0, 10) || '';
                        return `${vis} **${r.full_name}** — ${lang} ⭐${stars} — updated ${updated}\n   ${r.description || '_No description_'}`;
                    });
                    return textResult(`**Your repositories** (${repos.length})\n\n${lines.join('\n\n')}`);
                } catch (e: any) {
                    return textResult(`Error: ${e.message}`);
                }
            })
        })
    );

    // ── github_repo_info ────────────────────────────────────

    context.subscriptions.push(
        vscode.lm.registerTool('github_repo_info', {
            invoke: logged<{
                owner: string;
                repo: string;
            }>('github_repo_info', async (options, _token) => {
                try {
                    const { owner, repo } = options.input!;
                    if (!owner || !repo) { return textResult('Provide owner and repo name.'); }
                    const r = await ghRequest('GET', `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`);
                    const lines = [
                        `**${r.full_name}** ${r.private ? '🔒 Private' : '🌐 Public'}`,
                        r.description || '_No description_',
                        `Language: ${r.language || 'N/A'} | Stars: ${r.stargazers_count} | Forks: ${r.forks_count}`,
                        `Default branch: ${r.default_branch} | Open issues: ${r.open_issues_count}`,
                        `Created: ${r.created_at?.slice(0, 10)} | Updated: ${r.updated_at?.slice(0, 10)}`,
                        r.homepage ? `Homepage: ${r.homepage}` : '',
                        `Clone: ${r.clone_url}`,
                    ].filter(Boolean);
                    return textResult(lines.join('\n'));
                } catch (e: any) {
                    return textResult(`Error: ${e.message}`);
                }
            })
        })
    );

    // ── github_list_issues ──────────────────────────────────

    context.subscriptions.push(
        vscode.lm.registerTool('github_list_issues', {
            invoke: logged<{
                owner: string;
                repo: string;
                state?: 'open' | 'closed' | 'all';
                labels?: string;
                perPage?: number;
            }>('github_list_issues', async (options, _token) => {
                try {
                    const { owner, repo } = options.input!;
                    if (!owner || !repo) { return textResult('Provide owner and repo.'); }
                    const state = options.input?.state || 'open';
                    const perPage = Math.min(options.input?.perPage || 15, 100);
                    let url = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues?state=${state}&per_page=${perPage}`;
                    if (options.input?.labels) { url += `&labels=${encodeURIComponent(options.input.labels)}`; }

                    const issues = await ghRequest('GET', url);
                    // Filter out PRs (GitHub API returns PRs in issues endpoint)
                    const real = (issues as any[]).filter((i: any) => !i.pull_request);
                    if (real.length === 0) {
                        return textResult(`No ${state} issues found in ${owner}/${repo}.`);
                    }
                    const lines = real.map((i: any) => {
                        const labels = (i.labels || []).map((l: any) => l.name).join(', ');
                        return `#${i.number} **${i.title}** — ${i.state}\n   By ${i.user?.login || '?'} on ${i.created_at?.slice(0, 10)} | ${i.comments} comments${labels ? ` | Labels: ${labels}` : ''}`;
                    });
                    return textResult(`**Issues in ${owner}/${repo}** (${state}, ${real.length})\n\n${lines.join('\n\n')}`);
                } catch (e: any) {
                    return textResult(`Error: ${e.message}`);
                }
            })
        })
    );

    // ── github_create_issue ─────────────────────────────────

    context.subscriptions.push(
        vscode.lm.registerTool('github_create_issue', {
            invoke: logged<{
                owner: string;
                repo: string;
                title: string;
                body?: string;
                labels?: string[];
                assignees?: string[];
            }>('github_create_issue', async (options, _token) => {
                try {
                    const { owner, repo, title } = options.input!;
                    if (!owner || !repo || !title) { return textResult('Provide owner, repo, and title.'); }
                    const payload: Record<string, any> = { title };
                    if (options.input?.body) { payload.body = options.input.body; }
                    if (options.input?.labels?.length) { payload.labels = options.input.labels; }
                    if (options.input?.assignees?.length) { payload.assignees = options.input.assignees; }

                    const issue = await ghRequest('POST', `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues`, payload);
                    return textResult(`Issue created: #${issue.number} **${issue.title}**\nURL: ${issue.html_url}`);
                } catch (e: any) {
                    return textResult(`Error: ${e.message}`);
                }
            })
        })
    );

    // ── github_list_prs ─────────────────────────────────────

    context.subscriptions.push(
        vscode.lm.registerTool('github_list_prs', {
            invoke: logged<{
                owner: string;
                repo: string;
                state?: 'open' | 'closed' | 'all';
                perPage?: number;
            }>('github_list_prs', async (options, _token) => {
                try {
                    const { owner, repo } = options.input!;
                    if (!owner || !repo) { return textResult('Provide owner and repo.'); }
                    const state = options.input?.state || 'open';
                    const perPage = Math.min(options.input?.perPage || 15, 100);
                    const prs = await ghRequest('GET', `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls?state=${state}&per_page=${perPage}`);
                    if (!Array.isArray(prs) || prs.length === 0) {
                        return textResult(`No ${state} pull requests in ${owner}/${repo}.`);
                    }
                    const lines = prs.map((p: any) => {
                        const draft = p.draft ? ' 📝 Draft' : '';
                        return `#${p.number} **${p.title}**${draft}\n   ${p.head?.ref || '?'} → ${p.base?.ref || '?'} | By ${p.user?.login || '?'} on ${p.created_at?.slice(0, 10)} | +${p.additions || '?'}/-${p.deletions || '?'}`;
                    });
                    return textResult(`**Pull Requests in ${owner}/${repo}** (${state}, ${prs.length})\n\n${lines.join('\n\n')}`);
                } catch (e: any) {
                    return textResult(`Error: ${e.message}`);
                }
            })
        })
    );

    // ── github_pr_details ───────────────────────────────────

    context.subscriptions.push(
        vscode.lm.registerTool('github_pr_details', {
            invoke: logged<{
                owner: string;
                repo: string;
                pullNumber: number;
            }>('github_pr_details', async (options, _token) => {
                try {
                    const { owner, repo, pullNumber } = options.input!;
                    if (!owner || !repo || !pullNumber) { return textResult('Provide owner, repo, and pullNumber.'); }
                    const p = await ghRequest('GET', `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls/${pullNumber}`);
                    const lines = [
                        `#${p.number} **${p.title}** — ${p.state}${p.draft ? ' (Draft)' : ''}${p.merged ? ' ✅ Merged' : ''}`,
                        `By ${p.user?.login || '?'} on ${p.created_at?.slice(0, 10)}`,
                        `${p.head?.ref} → ${p.base?.ref} | +${p.additions}/-${p.deletions} | ${p.changed_files} files`,
                        `Comments: ${p.comments} | Reviews: ${p.review_comments}`,
                        p.body ? `\n---\n${p.body.substring(0, 1500)}` : '',
                        `\nURL: ${p.html_url}`,
                    ].filter(Boolean);
                    return textResult(lines.join('\n'));
                } catch (e: any) {
                    return textResult(`Error: ${e.message}`);
                }
            })
        })
    );

    // ── github_create_pr ────────────────────────────────────

    context.subscriptions.push(
        vscode.lm.registerTool('github_create_pr', {
            invoke: logged<{
                owner: string;
                repo: string;
                title: string;
                head: string;
                base: string;
                body?: string;
                draft?: boolean;
            }>('github_create_pr', async (options, _token) => {
                try {
                    const { owner, repo, title, head, base } = options.input!;
                    if (!owner || !repo || !title || !head || !base) {
                        return textResult('Provide owner, repo, title, head branch, and base branch.');
                    }
                    const payload: Record<string, any> = { title, head, base };
                    if (options.input?.body) { payload.body = options.input.body; }
                    if (options.input?.draft) { payload.draft = true; }

                    const pr = await ghRequest('POST', `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls`, payload);
                    return textResult(`PR created: #${pr.number} **${pr.title}**\n${pr.head?.ref} → ${pr.base?.ref}\nURL: ${pr.html_url}`);
                } catch (e: any) {
                    return textResult(`Error: ${e.message}`);
                }
            })
        })
    );

    // ── github_list_notifications ───────────────────────────

    context.subscriptions.push(
        vscode.lm.registerTool('github_list_notifications', {
            invoke: logged<{
                all?: boolean;
                perPage?: number;
            }>('github_list_notifications', async (options, _token) => {
                try {
                    const all = options.input?.all ? 'true' : 'false';
                    const perPage = Math.min(options.input?.perPage || 20, 50);
                    const notifs = await ghRequest('GET', `/notifications?all=${all}&per_page=${perPage}`);
                    if (!Array.isArray(notifs) || notifs.length === 0) {
                        return textResult('No notifications.');
                    }
                    const lines = notifs.map((n: any) => {
                        const repo = n.repository?.full_name || '?';
                        const reason = n.reason || '?';
                        const updated = n.updated_at?.slice(0, 16).replace('T', ' ') || '';
                        return `• **${n.subject?.title || '?'}** (${n.subject?.type || '?'})\n  ${repo} | ${reason} | ${updated}${n.unread ? ' 🔵' : ''}`;
                    });
                    return textResult(`**Notifications** (${notifs.length})\n\n${lines.join('\n\n')}`);
                } catch (e: any) {
                    return textResult(`Error: ${e.message}`);
                }
            })
        })
    );

    // ── github_list_branches ────────────────────────────────

    context.subscriptions.push(
        vscode.lm.registerTool('github_list_branches', {
            invoke: logged<{
                owner: string;
                repo: string;
                perPage?: number;
            }>('github_list_branches', async (options, _token) => {
                try {
                    const { owner, repo } = options.input!;
                    if (!owner || !repo) { return textResult('Provide owner and repo.'); }
                    const perPage = Math.min(options.input?.perPage || 30, 100);
                    const branches = await ghRequest('GET', `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/branches?per_page=${perPage}`);
                    if (!Array.isArray(branches) || branches.length === 0) {
                        return textResult(`No branches found in ${owner}/${repo}.`);
                    }
                    const lines = branches.map((b: any) => {
                        const prot = b.protected ? ' 🔒' : '';
                        return `• **${b.name}**${prot} — ${b.commit?.sha?.slice(0, 7) || '?'}`;
                    });
                    return textResult(`**Branches in ${owner}/${repo}** (${branches.length})\n\n${lines.join('\n')}`);
                } catch (e: any) {
                    return textResult(`Error: ${e.message}`);
                }
            })
        })
    );
}
