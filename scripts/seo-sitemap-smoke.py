"""Read-only sitemap URL integrity check; Python standard library only."""
import json
import sys
import urllib.request
import urllib.parse
import xml.etree.ElementTree as ET


def inspect_xml(body):
    root = ET.fromstring(body)
    if root.tag not in {
        '{http://www.sitemaps.org/schemas/sitemap/0.9}urlset',
        '{http://www.sitemaps.org/schemas/sitemap/0.9}sitemapindex',
    }:
        raise ValueError('Unexpected sitemap root or namespace')
    locations = [node.text or '' for node in root.iter() if node.tag.rsplit('}', 1)[-1] == 'loc']
    invalid = []
    for value in locations:
        try:
            url = urllib.parse.urlsplit(value)
            valid = url.scheme == 'https' and bool(url.hostname) and not url.username and not url.password
        except ValueError:
            valid = False
        if not valid:
            invalid.append(value)
    return {'locations': len(locations), 'invalidLocations': len(invalid),
            'examples': invalid[:3], 'ok': bool(locations) and not invalid}


def check(url):
    parsed = urllib.parse.urlsplit(url)
    if parsed.scheme != 'https' or parsed.hostname not in {'youranimebox.com', 'www.youranimebox.com'} or parsed.username or parsed.password:
        raise ValueError('Use a public AnimeBox HTTPS sitemap URL')
    request = urllib.request.Request(url, headers={'User-Agent': 'AnimeBox-Sitemap-Smoke/1.0', 'Accept': 'application/xml'})
    with urllib.request.urlopen(request, timeout=20) as response:
        if response.geturl() != url:
            raise ValueError('Unexpected redirect')
        if response.headers.get_content_type() not in {'application/xml', 'text/xml'}:
            raise ValueError('Expected XML content type')
        body = response.read(8 * 1024 * 1024 + 1)
        if len(body) > 8 * 1024 * 1024:
            raise ValueError('Sitemap exceeds 8 MiB smoke budget')
        return inspect_xml(body)


if __name__ == '__main__':
    targets = sys.argv[1:] or ['https://youranimebox.com/sitemap-index.xml', 'https://youranimebox.com/sitemap-recent.xml']
    failed = False
    for target in targets[:6]:
        try:
            result = check(target)
            print(json.dumps({'url': target, **result}, ensure_ascii=False))
            failed |= not result['ok']
        except Exception as error:
            print(json.dumps({'ok': False, 'error': type(error).__name__}))
            failed = True
    sys.exit(1 if failed or len(targets) > 6 else 0)
