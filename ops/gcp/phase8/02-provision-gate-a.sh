#!/usr/bin/env bash
set -euo pipefail
# Historical provisioner quarantined: it exposed database passwords in process argv.
# Fail before reading configuration, credentials, or invoking any external command.
printf '%s\n' 'HISTORICAL_PROVISIONER_DISABLED: consulte ops/gcp/phase8/README.md para o fluxo seguro.' >&2
exit 1
