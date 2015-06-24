# markup-formatter
NodeJS script for formatting markup-based files (like HTML, XML, etc)

```
markup-formatter.js [options] file...

Options:
   -i --indent <text>   use <text> as indent when prettifying (default: 3 spaces)
   -n --inplace         replace content of input files (default: write to stdout)
   -e --ext <extension> output result to new files with added filename <extension>
   -m --minify          minify instead of prettify
   -nc --no-comments    strip markup comments from result
   -ia --indent-attrib  indent attributes (default: inline attributes)
   -p --print           always write result to stdout, even when --inplace or --ext is specified
   -k --keepgoing       always continue, even when file read or write errors occur
   -h --help            show this help

Examples:
nodejs markup-formatter.js input.html
   : prettify input.html using 3-space indent and write result to stdout

nodejs markup-formatter.js --inplace -n ' ' input.xml
   : prettify input.xml using 1-space indent and replace input.xml with result

nodejs markup-formatter.js --minify -e min a.html b.html c.html
   : minify a.html, b.html & c.html creating output files a.html.min, b.html.min & c.html.min
```
