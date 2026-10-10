/**
 * TaskForge AI Backend - Automated AI Integration Unit & Mock Tests
 * Mocks external HTTP / SDK calls so tests do not require a running Ollama or real OpenAI key.
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { OllamaProvider } from '../service/ai/ollama.provider.js';
import { OpenAIProvider } from '../service/ai/openai.provider.js';
import { AiService } from '../service/ai/ai.service.js';
import {
  TaskGenerationOutputSchema,
  validateTaskDependencies,
  AssignmentRecommendationOutputSchema,
  SprintInsightsOutputSchema,
  RecoveryRecommendationOutputSchema,
} from '../service/ai/ai.schemas.js';

describe('AI Suite: Provider Selection & Unified Interface', () => {
  it('selects Ollama when AI_PROVIDER=ollama', () => {
    const mockOllama = { name: 'ollama' };
    const mockOpenai = { name: 'openai' };
    const service = new AiService({
      config: { provider: 'ollama', fallbackEnabled: false },
      ollama: mockOllama,
      openai: mockOpenai,
    });

    assert.equal(service.getPrimaryProvider().name, 'ollama');
    assert.equal(service.getSecondaryProvider().name, 'openai');
  });

  it('selects OpenAI when AI_PROVIDER=openai', () => {
    const mockOllama = { name: 'ollama' };
    const mockOpenai = { name: 'openai' };
    const service = new AiService({
      config: { provider: 'openai', fallbackEnabled: false },
      ollama: mockOllama,
      openai: mockOpenai,
    });

    assert.equal(service.getPrimaryProvider().name, 'openai');
    assert.equal(service.getSecondaryProvider().name, 'ollama');
  });

  it('never switches providers when fallback is disabled', async () => {
    let secondaryCalled = false;
    const failingPrimary = {
      generateStructured: async () => {
        const err = new Error('Ollama offline');
        err.code = 'OLLAMA_UNREACHABLE';
        err.recoverable = true;
        throw err;
      },
    };
    const secondary = {
      generateStructured: async () => {
        secondaryCalled = true;
        return { data: {}, meta: {} };
      },
    };

    const service = new AiService({
      config: { provider: 'ollama', fallbackEnabled: false },
      ollama: failingPrimary,
      openai: secondary,
    });

    await assert.rejects(
      async () => {
        await service.executeStructuredPrompt({
          systemPrompt: 'sys',
          userPrompt: 'usr',
        });
      },
      (err) => {
        assert.equal(err.code, 'OLLAMA_UNREACHABLE');
        return true;
      }
    );

    assert.equal(secondaryCalled, false, 'Secondary provider must NOT be invoked when fallback is disabled');
  });

  it('falls back to secondary provider when fallback is enabled for recoverable errors', async () => {
    const failingPrimary = {
      generateStructured: async () => {
        const err = new Error('Ollama timeout');
        err.code = 'AI_TIMEOUT';
        err.recoverable = true;
        throw err;
      },
    };
    const secondary = {
      generateStructured: async () => {
        return {
          data: { result: 'ok' },
          meta: { provider: 'openai', model: 'gpt-4o-mini', generatedAt: '2026-10-10' },
        };
      },
    };

    const service = new AiService({
      config: { provider: 'ollama', fallbackEnabled: true },
      ollama: failingPrimary,
      openai: secondary,
    });

    const res = await service.executeStructuredPrompt({
      systemPrompt: 'sys',
      userPrompt: 'usr',
    });

    assert.equal(res.data.result, 'ok');
    assert.equal(res.meta.fallbackUsed, true);
    assert.equal(res.meta.primaryProviderFailed, 'ollama');
    assert.equal(res.meta.provider, 'openai');
  });
});

describe('AI Suite: Schema Validation & Dependency Integrity', () => {
  it('validates correct task generation output', () => {
    const payload = {
      tasks: [
        {
          suggestionId: 'SUGG-1',
          title: 'Design DB Schema',
          description: 'PostgreSQL schema with indexes',
          suggestedRole: 'Database Engineer',
          requiredSkills: ['SQL', 'PostgreSQL'],
          effortHours: 6,
          priority: 'High',
          dependencies: [],
        },
        {
          suggestionId: 'SUGG-2',
          title: 'Implement REST Endpoints',
          description: 'Express controllers and routers',
          suggestedRole: 'Backend Developer',
          requiredSkills: ['Node.js', 'Express'],
          effortHours: 8,
          priority: 'High',
          dependencies: ['SUGG-1'],
        },
      ],
    };

    const parsed = TaskGenerationOutputSchema.safeParse(payload);
    assert.equal(parsed.success, true);
    assert.doesNotThrow(() => validateTaskDependencies(parsed.data.tasks, []));
  });

  it('rejects self-dependency in task proposal', () => {
    const tasks = [
      {
        suggestionId: 'SUGG-1',
        title: 'Task A',
        dependencies: ['SUGG-1'],
      },
    ];

    assert.throws(
      () => validateTaskDependencies(tasks, []),
      /Self-dependency detected/
    );
  });

  it('rejects circular dependency chains in task proposals', () => {
    const tasks = [
      { suggestionId: 'SUGG-1', title: 'Task 1', dependencies: ['SUGG-2'] },
      { suggestionId: 'SUGG-2', title: 'Task 2', dependencies: ['SUGG-3'] },
      { suggestionId: 'SUGG-3', title: 'Task 3', dependencies: ['SUGG-1'] },
    ];

    assert.throws(
      () => validateTaskDependencies(tasks, []),
      /Circular dependency chain detected/
    );
  });

  it('rejects unknown dependency references not in proposal or project', () => {
    const tasks = [
      { suggestionId: 'SUGG-1', title: 'Task 1', dependencies: ['NONEXISTENT-999'] },
    ];

    assert.throws(
      () => validateTaskDependencies(tasks, ['T-101']),
      /Invalid dependency reference/
    );
  });

  it('accepts valid existing project task IDs as dependencies', () => {
    const tasks = [
      { suggestionId: 'SUGG-1', title: 'Task 1', dependencies: ['T-101'] },
    ];

    assert.doesNotThrow(() => validateTaskDependencies(tasks, ['T-101']));
  });

  it('validates assignment recommendation schema', () => {
    const payload = {
      recommendations: [
        {
          taskId: '60d5ec49f1b2c8b1f8e4e1a1',
          developerId: '60d5ec49f1b2c8b1f8e4e1a2',
          displayName: 'Alex Rivera',
          skillMatchExplanation: 'Matches React and Node.js skills',
          currentWorkload: 65,
          availableCapacity: 14,
          suggestedAllocation: 6,
          recommendationReason: 'Best skill match with ample available hours',
          schedulingRisks: [],
        },
      ],
    };

    const parsed = AssignmentRecommendationOutputSchema.safeParse(payload);
    assert.equal(parsed.success, true);
  });

  it('validates sprint insights schema', () => {
    const payload = {
      summary: 'Sprint is proceeding on schedule with 2 high priority items.',
      insights: [
        {
          type: 'risk',
          title: 'Upcoming Deadline',
          description: 'Task T-102 is due in 2 days and still in progress.',
          severity: 'high',
          relatedTaskIds: ['T-102'],
          recommendation: 'Check if additional developer capacity can assist.',
        },
      ],
    };

    const parsed = SprintInsightsOutputSchema.safeParse(payload);
    assert.equal(parsed.success, true);
  });

  it('validates recovery recommendation schema preserving completed tasks', () => {
    const payload = {
      summary: 'Reassigned 1 task due to developer absence.',
      actions: [
        {
          actionType: 'reassign',
          taskId: 'T-102',
          recommendedAssigneeId: '60d5ec49f1b2c8b1f8e4e1a2',
          recommendedAssigneeName: 'Priya',
          reason: 'Priya has 20h available capacity and matches backend skills.',
        },
      ],
      preservedCompletedTasks: ['T-101: Database Design'],
      risksAndWarnings: [],
    };

    const parsed = RecoveryRecommendationOutputSchema.safeParse(payload);
    assert.equal(parsed.success, true);
    assert.equal(parsed.data.preservedCompletedTasks.length, 1);
  });
});

describe('AI Suite: Provider Error Handling & JSON Parsing', () => {
  it('OllamaProvider extracts JSON from markdown-wrapped code blocks', () => {
    const provider = new OllamaProvider({ baseUrl: 'http://127.0.0.1:11434', model: 'qwen3:4b' });
    const raw = '```json\n{"tasks":[{"suggestionId":"SUGG-1","title":"Test","effortHours":4,"priority":"Medium"}]}\n```';
    const extracted = provider._extractJson(raw);
    assert.equal(extracted.tasks[0].suggestionId, 'SUGG-1');
  });

  it('OllamaProvider strips Qwen thinking traces before parsing JSON', () => {
    const provider = new OllamaProvider({ baseUrl: 'http://127.0.0.1:11434', model: 'qwen3:4b' });
    const raw = '<think>planning the modules</think>{"tasks":[{"suggestionId":"SUGG-1","title":"Auth API","effortHours":"6","priority":"high"}]}';
    const extracted = provider._extractJson(raw);
    assert.equal(extracted.tasks[0].suggestionId, 'SUGG-1');
    const parsed = TaskGenerationOutputSchema.safeParse(extracted);
    assert.equal(parsed.success, true);
    assert.equal(parsed.data.tasks[0].effortHours, 6);
    assert.equal(parsed.data.tasks[0].priority, 'High');
  });

  it('OllamaProvider returns null on completely malformed JSON', () => {
    const provider = new OllamaProvider({ baseUrl: 'http://127.0.0.1:11434', model: 'qwen3:4b' });
    const extracted = provider._extractJson('I am sorry, I cannot fulfill this request as JSON.');
    assert.equal(extracted, null);
  });

  it('OpenAIProvider rejects if API key is missing when requested', () => {
    const provider = new OpenAIProvider({ apiKey: '', model: 'gpt-4o-mini' });
    assert.throws(
      () => provider.getClient(),
      (err) => {
        assert.equal(err.code, 'OPENAI_KEY_MISSING');
        return true;
      }
    );
  });
});
