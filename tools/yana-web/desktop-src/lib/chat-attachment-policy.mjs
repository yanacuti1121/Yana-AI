// Explicit files and images are user-selected context, so silently dropping
// them would make the composer claim a different request was sent. This stays
// independent from React and the transport so it can be regression-tested.
export function resolveAttachmentSendPolicy({ tier, files, image }) {
  const hasFiles = Array.isArray(files) && files.length > 0;
  const hasImage = Boolean(image);
  const hasExplicitAttachments = hasFiles || hasImage;

  // The runtime intentionally omits WorkspaceContext from secure turns. Images
  // have their own governed transport, but text files are part of that omitted
  // context. Stop before sending instead of making the composer imply the file
  // was included when it was not.
  if (tier && hasFiles) {
    return { allowed: false, hasExplicitAttachments };
  }

  return { allowed: true, hasExplicitAttachments };
}
