## Example Query for Newly Updated Retrieve and Rank:

https://091d880c-9617-490f-a859-87a7c7b1b8ad:IhxEV2KTiY1B@gateway.watsonplatform.net/retrieve-and-rank/api/v1/solr_clusters/sccaa3604c_1f02_4567_8162_c15dfe749fdf/solr/neuro_collection/fcselect?ranker_id=54922ax21-rank-18&q=I have muscle weakness&wt=json&fl=id,title

The example query here is "I have muscle weakness"

### Http Response:
{"responseHeader":{"status":0,"QTime":169},"response":{"numFound":17,"start":0,"maxScore":10.0,"docs":[{"id":"11","title":["ALS Most Common Symptoms"]},{"id":"14","title":["ALS Description"]},{"id":"6","title":["ALS Explanation of Lou Gehrig"]},{"id":"9","title":["ALS Rate of Progression"]},{"id":"7","title":["ALS When Explanation"]},{"id":"10","title":["ALS Gradual Onset"]},{"id":"16","title":["ALS Age Ranges"]},{"id":"15","title":["ALS Age Ranges"]},{"id":"21","title":["Giant cell arteritis general symptoms"]},{"id":"4","title":["ALS Symptoms 3"]}]}}

### This response returns a number of ranked documents with identifying titles. We should be able to interpret this in the javascript and say to the user in the Chatbot, "We think you have ALS based on the symptoms you have provided to us." 
