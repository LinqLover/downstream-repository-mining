#!/usr/bin/python3
from functools import reduce
import pypandoc
import regex
import sys


subs = {
    r'(<table>[\s\S]+?</table>)\n\n(?:Table)?: ([^\r\n]+)(?:{#(.+)})': lambda table: regex.sub(
            r'''
                \\begin\{longtable\}
                (.*)
                \\endhead
                (.*)
                \\end\{longtable\}
            ''',
            lambda match: '\n'.join([
                r'\begin{table*}',
                r'\centering',
                rf'\begin{{tabular}}{match[1]}{match[2]}\end{{tabular}}',
                (r'\caption{'
                + f'{table[2]}'
                + (rf'\label{{{table[3]}}}' if len(table) >= 3 else '')
                + r'}'),
                r'\end{table*}'
            ]),
            pypandoc.convert_text(table[1], format='html', to='latex', extra_args=[
                #'--filter=pandoc-xnos'
            ]),
            flags=regex.VERBOSE | regex.S),
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
