export async function shareLink(url,title,platform=navigator) {
  if(platform.share) {
    try {await platform.share({title,url});return 'shared';}
    catch(error){if(error.name==='AbortError')return 'cancelled';}
  }
  try {await platform.clipboard.writeText(url);return 'copied';}
  catch {return 'manual';}
}
