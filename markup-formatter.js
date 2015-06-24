var fs = require('fs');

/*
The Formatter is a simple markup-parser and rewriter.

The parser a very simple (not-strictly-conforming) markup-to-JSON converter, displaying errors when something is
seriously wrong (like unterminated comments) and warnings when something is a bit wrong (like extraneous text).
Other than that, it tries to be happy about everything thrown at it, performing very little validation of tags/attributes/etc.

During the formatting rewrite, it makes some assumptions about certain HTML markup elements to try and ensure the end result appears
the same when rendered in a browser.
*/

function Formatter(markup, opts) {
    // normalise line-endings
    this.markup = markup.trim().replace(/\r?\n|\r/g,'\n');
    this.mlines = null;
    this.opts = opts;
    // the list of elements which cannot (according to the spec) contain content
    this.htmlempties = ['area','base','br','col','command','embed','hr','img','input','keygen','link','meta','param','source','track','wbr'];
    // the regex to detect elements which, by default, are highly whitespace-sensitive (and whose content should probably not be reformatted)
    this.wss = /^span$|^pre$|^a$|^label$|^p$/i;
}

Formatter.prototype = {

    log: function(s) {
        // uncomment for amazing amounts of info...
        //console.log(s);
    },

    loginfo: function(s) {
        // uncomment for some status info...
        //console.log(s);
    },

    logwarn: function(s) {
        console.log('WARNING: '+s);
    },

    logerror: function(s) {
        console.log('ERROR: '+s);
    },

    // convert character index to a line,col position string
    idxtolc: function(idx) {
        // first time this is called, split the markup into lines
        if (!this.mlines) {
            this.mlines = this.markup.split(/\n/);
        }
        for (var i=0, j=0, l=0; (i < idx) && (l < this.mlines.length); l++) {
            j = i;
            i += this.mlines[l].length+1;
        }
        j = idx-j+1;
        if (!l)l=1;
        return 'line '+l+', col '+j;
    },

    format: function() {
        var x = this.parse();
        var o = {
            indent:this.opts.indent,
            nodejoin:'\n',
            attrquote:'"',
        };
        // minifying is just prettifying with no indent or newlines...
        if (this.opts.minify) {
            o.indent = '';
            o.nodejoin = '';
        }
            
        var topnodes=[];
        for (var i=0; i < x.nodes.length; i++) {
            var tn = this.formatnode(x.nodes[i], false, o);
            if (tn === '') continue;
            topnodes.push(tn);
        }
        
        var s = this.joinnodes(topnodes, o.nodejoin);
        //console.log(JSON.stringify(topnodes, null, '   '));
        return s;
    },
    
    // like Array.join, but works on deeply-nested arrays
    joinnodes : function(nodes, sep) {
        var s = '';
        for (var i=0; i < nodes.length; i++) {
            if (Array.isArray(nodes[i])) {
                s = s + this.joinnodes(nodes[i], sep);
            } else s = s + nodes[i] + sep;
        }
        return s;
    },
    
    formatnode : function(node, keepwhitespace, o) {
            if (node.text||node.text==='') {
                if (keepwhitespace) return node.text;
                var trimmed = node.text.trim();
                return trimmed;
            }
            if (node.comment) {
                if (this.opts.includecomments)
                    return '<'+node.comment;
                return '';
            }
            var s=['<'+node.tagname];
            var attribs = [];
            for (var i=0; i < node.attributes.length; i++) {
                var a = node.attributes[i].name;
                if (node.attributes[i].value !== null) {
                    var attribval = node.attributes[i].value;
                    a+= '=' + o.attrquote + attribval + o.attrquote;
                }
                attribs.push(a);
            }
            if (this.opts.indentattribs) {
                // stack the attributes
                this.indentnodes(attribs, o.indent);
                s = s.concat(attribs);
                // put the end-of-open-tag on the same line as the last attribute
                s.push(s.pop()+node.eoot);
                //s.push(node.eoot);
            } else {
                // inline the attributes
                if (attribs.length > 0) {
                    s[0] = s[0] + ' ' + attribs.join(' ');
                }
                s[0] += node.eoot;
            }
            if (['/>','?>'].indexOf(node.eoot)>=0)
                return s;
                
            var childnodes = [], subtext=false, subnodes=false, subpre=false;
            for (var i=0; i < node.children.length; i++) {
                var child = node.children[i];
                var ispre = this.wss.test(child.tagname);
                var afterpre = this.wss.test((node.children[i+1]||{}).tagname);
                var beforepre = this.wss.test((node.children[i-1]||{}).tagname);
                var childkw = keepwhitespace||ispre;
                subpre = subpre || ispre;
                subtext = subtext || !!(child.text||'').trim().length;
                subnodes = subnodes || !!child.tagname;
                var c = this.formatnode(child, childkw, o);
                if (c==='') continue;
                childnodes.push(c);
            }
            
            var ispre = this.wss.test(node.tagname);
            if (subnodes && !subtext && !ispre) {
                // node contains only non-pre subnodes - stack it
                this.indentnodes(childnodes, o.indent);
                s = s.concat(childnodes);
                s.push(node.eon);
                return s;
            }
            // node is empty, contains non-whitespace text or has a pre-type-node - inline it
            var eoot = s.pop();
            eoot += this.joinnodes(childnodes,'') + node.eon;
            s.push(eoot);
            return s;
    },
    
    // apply an indent string to a (nested) array of node content
    indentnodes : function(nodes, indent) {
        for (var i=0; i < nodes.length; i++) {
            if (Array.isArray(nodes[i])) 
                this.indentnodes(nodes[i], indent);
            else if (nodes[i])
                nodes[i] = indent + nodes[i];
        }
    },
    
    parse: function() {
        var x = this.nextnodecontent(this.markup, 0);
        var r = this.markup.substring(x.i).match(/.*/);
        
        var res = {
            nodes: x.nodes,
            posttext: r[0],
        };
        
        if (r[0].length) {
            this.logwarn('Non-element text found starting at '+this.idxtolc(x.i));
        }
        //console.log(JSON.stringify(res, null, '   '));        
        return res;
    },
        
    nextnodecontent: function(m, i) {  
        var nodes = [];
        while (true) {
            // pre-child text
            r = m.match(/[^<]*/);
            if (r[0].length) {
                m = m.substring(r[0].length);
                i += r[0].length;
                nodes.push({text:r[0]});
                if (r[0].trim().length)
                    this.log('found node text='+r[0].trim());
            }
            var childinfo = this.nextnode(m, i);
            if (!childinfo) break;
            nodes.push(childinfo.node);
            i = childinfo.i;
            m = childinfo.m;
        }
        return {nodes:nodes, m:m, i:i};
    },
    
    nextnode: function(m, i) {  
        this.log('nextnode: i='+i+', '+this.idxtolc(i));  
        var r = m.match(/^<(!-+)|^<([^/>\s]+)/);
        if (!r) {
            this.log('no node match');
            return;
        }

        var o = {
            // character offset
            index: i,
            // node name (or blank if a comment
            tagname:r[2]||'',
            // end of open tag - normally > or />
            eoot:'',
            // comment text (or blank if a normal node)
            comment: r[1]||'',
            // each attribute is { name:'', value:'' }, value is null for unvalued attributes (e.g disabled)
            attributes:[],
            // child text content and subnodes
            children:[],
            // end-of node - normally </xxx> or blank if self-closing (see eoot)
            eon:'',
        }
        m = m.substring(r[0].length);
        i+= r[0].length;
        
        if (o.comment) {
            this.log('Found comment');
            // leave whitespace in comments as is
            r = m.match(/^[\s\S]*?-->/);
            if (!r) {
                this.logerror('unterminated comment starting at ' + this.idxtolc(i));
                r = m.match(/.*/);
            }
            o.comment += r[0];
            m = m.substring(r[0].length);
            i+= r[0].length;
            return {node:o, m:m, i:i};
        }

        this.log('Found node: '+o.tagname);
        
        // search for attributes
        while (true) {
            r = m.match(/^\s+([^=\s/>]+)(=(["'])([\s\S]*?)\3)?/);
            if (!r) break;
            this.log('Found attribute: '+r[0]);
            var attr = {name:r[1], value:null};
            if (r[2]) attr.value = r[4];
            o.attributes.push(attr);
            m = m.substring(r[0].length);
            i += r[0].length;
        }
        
        // end-of open tag
        r = m.match(/^\s*(\/?>)/);
        if (!r) {
            if (o.tagname==='?xml')
                r = m.match(/^\s*(\?>)/);
            if (!r) {
                this.logerror('expected end-of-open-node marker at '+this.idxtolc(i));
                // copy everything until start of next node
                r = m.match(/([^<]*)/);
            }
        }
        this.log('oot: '+r[1]);
        o.eoot = r[1];
        m = m.substring(r[0].length);
        i += r[0].length;
        
        if (['/>','?>'].indexOf(o.eoot)>=0) {
            // self closing
            return {node:o, m:m, i:i};
        }
        
        // directive and void elements have no content (neither does colgroup when the span attribute is present)
        var ltn = o.tagname.toLowerCase();
        if ((/^!/.test(ltn)) || (this.htmlempties.indexOf(ltn) >= 0)
            || (ltn==='colgroup' && o.attributes.reduce(function(x,a){return x||((/span/i).test(a.name));}, false))) {
            this.loginfo(o.tagname + ' node found: assuming no content or children.');
            return {node:o, m:m, i:i};
        }
        
        // script elements have unrestricted content (for now we assume no comments, strings or expressions contain the closing tag
        if (ltn==='script') {
            this.loginfo(o.tagname + ' node found: assuming unrestricted content.');
            r = m.match(/^[\s\S]*?(?=<\/script>)/i);
            if (!r) {
                this.logerror('unterminated script tag starting at ' + this.idxtolc(i));
                r = m.match(/.*/);
            }
            o.children.push({text:r[0]});
            m = m.substring(r[0].length);
            i += r[0].length;
            //console.log('SCRIPT: '+r[0]);
        } else {
            // child nodes
            var cn = this.nextnodecontent(m, i);
            o.children = cn.nodes;
            i = cn.i;
            m = cn.m;
        }
        
        // closing node
        r = m.match(/^<\/([^>]+)>/);
        if (!r) {
            this.logerror('Tag "'+o.tagname+'" at '+this.idxtolc(o.index)+' is not closed at '+this.idxtolc(i));
            // copy everything until start of next node
            r = m.match(/[^<]*/);
            o.eon = r[0];
            i+= r[0].length;
            return {node:o, m:m, i:i};
        }
        
        if (r[1]!==o.tagname) {
            this.logerror('Tag "'+o.tagname+'" at '+this.idxtolc(o.index)+' is closed with "'+r[1]+'" at '+this.idxtolc(i));
            return {node:o, m:m, i:i};
        }
        
        this.log('closed node:'+o.tagname);
        o.eon = r[0];
        m = m.substring(r[0].length);
        i+= r[0].length;

        return {node:o, m:m, i:i};
    }
}

var globalopts = {
    // show help
    help: false,
    // replace the input files
    inplace: false,
    // minify instead of prettfiy
    minify: false,
    // strip whitespace from attributes
    minifyattributes: false,
    // the indent to use when prettifying
    indent: '   ',
    // should attributes be indented like child-nodes
    indentattribs: false,
    // extension to add when creating new files
    extension: '',
    // keep going in the face of file adversity
    keepgoing: false,
    // include markup comments (<!-- ... -->) in output
    includecomments: true,
    // always print output
    print: false,
    // the index in process.argv of the first input file
    startoffiles: null,
}

// process command line arguments
function processargs() {
    // first two args are 'nodejs' and 'markup-formatter.js'
    for (var i=2; i < process.argv.length; i++) {
        switch(process.argv[i]) {
            case '-h':
            case '--help':
                globalopts.help = true; return;
            case '-n': 
            case '--inplace':
                globalopts.inplace = true; break;
            case '-i':
            case '--indent':
                globalopts.indent = process.argv[++i]; break;
            case '-ia':
            case '--indent-attrib':
                globalopts.indentattribs = true; break;
            case '-e':
            case '--ext':
                globalopts.extension = process.argv[++i];
                if (!(/^\./).test(globalopts.extension))
                    globalopts.extension = '.'+globalopts.extension;
                break;
            case '-m':
            case '--minify':
                globalopts.minify = true; break;
            case '-nc':
            case '--no-comments':
                globalopts.includecomments = false; break;
            case '-k':
            case '--keepgoing':
                globalopts.keepgoing = true; break;
            default:
                globalopts.startoffiles = i;
                return;
        }
    }
}

/* main function
- loops over the files array in a synchronous fashion, processing each file in turn
    @param files: array of input file path names
*/
function nextfile(files) {
    if (!files || !files.length)
        return;
    // read the next file
    var filepathname = files.shift();
    fs.readFile(filepathname, {encoding:'utf8'}, function(err,data) {
        if (err) {
            console.log(err);
            if (globalopts.keepgoing) {
                nextfile(files);
            }
            return;
        }
        // format the data
        var s = new Formatter(data, globalopts).format();
        if (globalopts.inplace || globalopts.extension) {
            filepathname += globalopts.extension;
            fs.writeFile(filepathname, s, {encoding:'utf8'}, function(err) {
                if (err) {
                    console.log(err);
                    if (globalopts.keepgoing) {
                        nextfile(files);
                    }
                    return;
                }
                if (globalopts.print)
                    console.log(s);
                nextfile(files);
            });
            return;
        }
        // no output file - just write to stdout
        console.log(s);
        nextfile(files);
    });
}

// start...
processargs();

if (globalopts.help) {
    console.log('markup-formatter version 1.0');
    console.log('A simple tool for reformatting markup files (like HTML, XML, etc)');
    console.log('');
    console.log('markup-formatter.js [options] file...');
    console.log('');
    console.log('Options:');
    console.log('   -i --indent <text>   use <text> as indent when prettifying (default: 3 spaces)')
    console.log('   -n --inplace         replace content of input files (default: write to stdout)');
    console.log('   -e --ext <extension> output result to new files with added filename <extension>')
    console.log('   -m --minify          minify instead of prettify')
    console.log('   -nc --no-comments    strip markup comments from result')
    console.log('   -ia --indent-attrib  indent attributes (default: inline attributes)')
    console.log('   -p --print           always write result to stdout, even when --inplace or --ext is specified')
    console.log('   -k --keepgoing       always continue, even when file read or write errors occur')
    console.log('   -h --help            show this help')
    console.log('')
    console.log('Examples:')
    console.log('nodejs markup-formatter.js input.html')
    console.log('   : prettify input.html using 3-space indent and write result to stdout')
    console.log('')
    console.log('nodejs markup-formatter.js --inplace -n \' \' input.xml')
    console.log('   : prettify input.xml using 1-space indent and replace input.xml with result')
    console.log('')
    console.log('nodejs markup-formatter.js --minify -e min a.html b.html c.html')
    console.log('   : minify a.html, b.html & c.html creating output files a.html.min, b.html.min & c.html.min')
    console.log('')
    return;
}

if (!globalopts.startoffiles) {
    console.log('No input files.');
    return;
}

// main...
nextfile(process.argv.slice(globalopts.startoffiles));

