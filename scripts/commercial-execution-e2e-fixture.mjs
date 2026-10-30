import { randomUUID } from 'node:crypto';
import { agenticE2EPlan } from './agentic-workspace-e2e-fixture.mjs';

// Local fixture only. Exercises the real SDK transport, authorization and metering,
// but cannot make a network request or use a real provider key.
export function commercialE2ETransport(_url, init) {
  const body = JSON.parse(String(init?.body));
  const role = JSON.parse(body.instructions.split('\n\n')[0]).profile.role;
  const inputs = typeof body.input === 'string' ? [{ content: body.input }] : body.input;
  const user = inputs.find((item) => item.role === 'user' || typeof item.content === 'string');
  const text =
    typeof user?.content === 'string' ? user.content : user?.content?.find((part) => part.type === 'input_text')?.text;
  const packet = JSON.parse(text).untrustedContext;
  const alreadySubmitted = inputs.some((item) => item.type === 'function_call_output');
  const id = randomUUID().replaceAll('-', '');
  const output = alreadySubmitted
    ? [
        {
          id: 'msg_' + id,
          type: 'message',
          role: 'assistant',
          status: 'completed',
          content: [{ type: 'output_text', text: 'Concluído.', annotations: [] }],
        },
      ]
    : [
        {
          id: 'fc_' + id,
          type: 'function_call',
          status: 'completed',
          call_id: 'call_' + id,
          name: body.tools.find((tool) => tool.name.endsWith('task_submit')).name,
          arguments: JSON.stringify(
            agenticE2EPlan({ role, packet }).find((step) => step.toolCall?.name === 'task.submit').toolCall.input,
          ),
        },
      ];
  const response = {
    id: 'resp_' + id,
    object: 'response',
    created_at: Math.floor(Date.now() / 1000),
    model: 'gpt-6.1-sol',
    status: 'completed',
    output,
    usage: {
      input_tokens: 100,
      output_tokens: 20,
      total_tokens: 120,
      input_tokens_details: { cached_tokens: 0 },
      output_tokens_details: { reasoning_tokens: 0 },
    },
    parallel_tool_calls: false,
    tool_choice: 'auto',
    tools: body.tools,
  };
  const frames = [
    { type: 'response.created', response: { ...response, status: 'in_progress', output: [] } },
    { type: 'response.output_item.added', output_index: 0, item: output[0] },
    { type: 'response.output_item.done', output_index: 0, item: output[0] },
    { type: 'response.completed', response },
  ];
  return Promise.resolve(
    new Response(
      frames
        .map(
          (frame, index) => `event: ${frame.type}\ndata: ${JSON.stringify({ ...frame, sequence_number: index })}\n\n`,
        )
        .join(''),
      { headers: { 'content-type': 'text/event-stream' } },
    ),
  );
}
