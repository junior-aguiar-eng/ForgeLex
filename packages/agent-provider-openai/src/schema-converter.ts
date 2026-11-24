import { toolJsonSchema } from '@forgelex/agent-core';

export function convertZodToOpenAIToolSchema(schema: unknown): Record<string, unknown> {
  return toolJsonSchema(schema);
}

/** Only support the known closed authority input. A changed schema falls back to the existing adapter. */
export function strictAuthorityParameters(name: string, parameters: Record<string, unknown>) {
  if (name !== 'research.get_authority' && name !== 'research.verify_authority') return;
  const properties = parameters.properties as Record<string, { type?: string }> | undefined;
  const required = parameters.required;
  if (
    parameters.type !== 'object' ||
    parameters.additionalProperties !== false ||
    !properties ||
    Object.keys(properties).length !== 3 ||
    properties.court?.type !== 'string' ||
    properties.processNumber?.type !== 'string' ||
    properties.judgmentDate?.type !== 'string' ||
    !Array.isArray(required) ||
    required.length !== 2 ||
    !required.includes('court') ||
    !required.includes('processNumber')
  )
    return;
  return {
    ...parameters,
    required: [...required, 'judgmentDate'],
    properties: { ...properties, judgmentDate: { anyOf: [properties.judgmentDate, { type: 'null' }] } },
  };
}
