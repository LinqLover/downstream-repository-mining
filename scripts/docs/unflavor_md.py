#!/usr/bin/python3
from functools import reduce
import pypandoc
import regex
import sys


subs = {
	r'<table>[\s\S]+?</table>': lambda table: pypandoc.convert_text(
		table.group(), format='html', to='markdown'),
	r'<span class="smallcaps">(.+?)</span>': lambda span:
		fr'\textsc{{{span.group(1)}}}',
	r'[\U00010000-\U0010ffff]': lambda symbol:
		fr'`{{\DejaSans {symbol.group()}}}`{{=latex}}'
}


def main(file_name):

    with open(file_name) as file:
        markdown = file.read()

    markdown = reduce(
		lambda txt, sub: regex.sub(*sub, txt),
		subs.items(),
		markdown)

    sys.stdout.write(markdown)


if __name__ == '__main__':
    main(*sys.argv[1:])
