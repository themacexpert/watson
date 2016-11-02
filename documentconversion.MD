# Basic Document Conversion

### Example Request: 
curl -X POST -u "{username}":"{password}" -F config="{\"conversion_target\":\"answer_units\"}" -F "file=@sample.pdf" "https://gateway.watsonplatform.net/document-conversion/api/v1/convert_document?version=2015-12-15"

### Instructions (only things in command to change): 
Replace the username and password fields with your bluemix credentials for the *document conversion service.*

Replace **answer_units** with the preferred conversion target, which can be either **answer_units**, **normalized_html**, or **normalized_text.**

sample.pdf is the name of the file you'd like to convert. Watson autodectects the type of file otherwise you can manually specify.

Then you get output like the following shown in sampleoutput.txt.

### Tutorial Links:
http://www.ibm.com/watson/developercloud/document-conversion/api/v1/#convert-document
http://www.ibm.com/watson/developercloud/doc/document-conversion/tutorial.shtml
