export function shouldAutoJoin({ humanCount, autoJoin, connected }) {
  return !!autoJoin && !connected && humanCount > 1;
}

export function shouldAutoLeave({ humanCount, connected }) {
  return !!connected && humanCount <= 1;
}
