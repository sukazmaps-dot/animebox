import importlib.util
import unittest
import sys

sys.dont_write_bytecode = True

spec = importlib.util.spec_from_file_location('sitemap_smoke', 'scripts/seo-sitemap-smoke.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class SitemapIntegrity(unittest.TestCase):
    def test_exact_public_urls_and_image_query(self):
        xml = '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1"><url><loc>https://youranimebox.com/anime/unique-12345</loc><image:image><image:loc>https://s4.anilist.co/a123.jpg?a=1&amp;b=2</image:loc></image:image></url></urlset>'
        self.assertEqual(module.inspect_xml(xml)['locations'], 2)
        self.assertTrue(module.inspect_xml(xml)['ok'])

    def test_actual_broken_recent_sitemap_scheme(self):
        xml = '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>https//yoranimebox.com/anime/nique-</loc></url></urlset>'
        self.assertEqual(module.inspect_xml(xml)['invalidLocations'], 1)
        self.assertFalse(module.inspect_xml(xml)['ok'])

    def test_empty_sitemap_is_not_crawl_success(self):
        self.assertFalse(module.inspect_xml('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"/>')['ok'])

    def test_invalid_xml_and_html(self):
        for xml in ['<html/>', '<urlset', '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><loc>https://x.test/?a=1&b=2</loc></urlset>']:
            with self.assertRaises(Exception):
                module.inspect_xml(xml)


if __name__ == '__main__':
    unittest.main()
